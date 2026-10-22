import { Client } from 'pg'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Generates the single round-robin schedule (circle method) and packs it into
// nine matchdays, then writes it to league_matches.
//
//   node --env-file=.env.local scripts/generate-fixtures.mjs            # preview only
//   node --env-file=.env.local scripts/generate-fixtures.mjs --all      # preview every matchday
//   node --env-file=.env.local scripts/generate-fixtures.mjs --apply    # backup + rewrite fixture rows
//
// 18 players -> 17 rounds x 9 matches (every pair exactly once). Two rounds go
// into each of the first eight matchdays; one match per matchday is moved into
// matchday 9, so every matchday has 17 matches and every player plays twice
// except for one rotating "light" matchday with a single match. Total per
// player stays 17.

const apply = process.argv.includes('--apply')
const showAll = process.argv.includes('--all')
const MATCHDAY_COUNT = 9

function circleRounds(ids) {
  const n = ids.length
  if (n < 2 || n % 2 !== 0) {
    throw new Error(`butuh jumlah pemain genap (>= 2), dapat ${n}`)
  }

  const fixed = ids[n - 1]
  let rot = ids.slice(0, n - 1)
  const rounds = []

  for (let r = 0; r < n - 1; r++) {
    const arr = [...rot, fixed]
    const round = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      // Alternate the venue assignment per round.
      round.push(r % 2 === 0 ? [a, b] : [b, a])
    }
    rounds.push(round)
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)]
  }

  return rounds
}

function packMatchdays(ids) {
  const rounds = circleRounds(ids)
  if (rounds.length !== MATCHDAY_COUNT * 2 - 1) {
    throw new Error(
      `butuh ${MATCHDAY_COUNT * 2 - 1} ronde untuk ${MATCHDAY_COUNT} pekan, dapat ${rounds.length}`,
    )
  }

  const matchdays = []
  for (let w = 0; w < MATCHDAY_COUNT - 1; w++) {
    matchdays.push([...rounds[2 * w], ...rounds[2 * w + 1]])
  }
  const last = [...rounds[rounds.length - 1]]

  // Move one match out of every earlier matchday into the last one. The moved
  // matches must not share players, otherwise someone would play three times
  // in the final matchday.
  const picks = []
  const used = new Set()
  const search = (w) => {
    if (w === matchdays.length) return true
    for (let i = 0; i < matchdays[w].length; i++) {
      const [a, b] = matchdays[w][i]
      if (used.has(a) || used.has(b)) continue
      used.add(a)
      used.add(b)
      picks.push([w, i])
      if (search(w + 1)) return true
      picks.pop()
      used.delete(a)
      used.delete(b)
    }
    return false
  }
  if (!search(0)) throw new Error('gagal memindahkan laga ke pekan terakhir')

  for (const [w, i] of picks) {
    const [edge] = matchdays[w].splice(i, 1)
    last.push(edge)
  }
  matchdays.push(last)

  return matchdays
}

// Nudge venue assignments until home games differ by at most one per player.
// Both legs store a home/away pair anyway, so this only affects the nominal
// first-leg host, but an even split keeps the fixture list tidy.
function balanceVenues(matchdays) {
  const counts = new Map()
  let totalMatches = 0
  for (const round of matchdays) {
    totalMatches += round.length
    for (const [home, away] of round) {
      counts.set(home, (counts.get(home) ?? 0) + 1)
      if (!counts.has(away)) counts.set(away, 0)
    }
  }

  const games = (totalMatches * 2) / counts.size
  const lower = Math.floor(games / 2)
  let changed = true
  while (changed) {
    changed = false
    for (const round of matchdays) {
      for (let i = 0; i < round.length; i++) {
        const [home, away] = round[i]
        if (counts.get(away) < lower && counts.get(home) > lower) {
          round[i] = [away, home]
          counts.set(home, counts.get(home) - 1)
          counts.set(away, counts.get(away) + 1)
          changed = true
        }
      }
    }
  }

  return matchdays
}

function validate(ids, matchdays) {
  const matches = matchdays.flat()
  const pairs = matches.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)
  const perPlayer = new Map(ids.map((id) => [id, 0]))
  const homePerPlayer = new Map(ids.map((id) => [id, 0]))
  const lightWeeks = new Map(ids.map((id) => [id, 0]))
  const problems = []

  for (const [home, away] of matches) {
    perPlayer.set(home, perPlayer.get(home) + 1)
    perPlayer.set(away, perPlayer.get(away) + 1)
    homePerPlayer.set(home, homePerPlayer.get(home) + 1)
  }

  for (const [index, round] of matchdays.entries()) {
    const seen = new Map()
    for (const [a, b] of round) {
      for (const id of [a, b]) seen.set(id, (seen.get(id) ?? 0) + 1)
    }
    const counts = [...seen.values()]
    if (counts.some((count) => count > 2)) {
      problems.push(`pekan ${index + 1}: ada pemain main lebih dari 2x`)
    }
    if (counts.filter((count) => count === 1).length !== 2) {
      problems.push(`pekan ${index + 1}: harus ada tepat 2 pemain dengan 1 laga`)
    }
    for (const [id, count] of seen) {
      if (count === 1) lightWeeks.set(id, (lightWeeks.get(id) ?? 0) + 1)
    }
    if (seen.size !== ids.length) {
      problems.push(`pekan ${index + 1}: ada pemain yang tidak bermain`)
    }
  }

  for (const [id, count] of lightWeeks) {
    if (count !== 1) problems.push(`pemain ${id}: pekan ringan ${count}x (harus 1x)`)
  }

  const matchCounts = [...new Set(perPlayer.values())]
  const homeRange = [Math.min(...homePerPlayer.values()), Math.max(...homePerPlayer.values())]

  if (matchdays.length !== MATCHDAY_COUNT) {
    problems.push(`jumlah pekan ${matchdays.length}, harus ${MATCHDAY_COUNT}`)
  }
  if (matchdays.some((round) => round.length !== 17)) {
    problems.push('ada pekan yang bukan 17 laga')
  }
  if (new Set(pairs).size !== pairs.length) problems.push('ada pasangan duplikat')
  if (matchCounts.length !== 1 || matchCounts[0] !== ids.length - 1) {
    problems.push('jumlah laga per pemain tidak seragam')
  }
  if (homeRange[1] - homeRange[0] > 1) problems.push('laga kandang tidak seimbang')

  return {
    matches: matches.length,
    uniquePairs: new Set(pairs).size,
    matchCounts,
    homeRange,
    lightWeeks: [...new Set(lightWeeks.values())],
    problems,
  }
}

function printMatchdays(matchdays) {
  const limit = showAll ? matchdays.length : Math.min(3, matchdays.length)
  for (let i = 0; i < limit; i++) {
    const line = matchdays[i].map(([home, away]) => `${home}v${away}`).join('  ')
    console.log(`Pekan ${String(i + 1).padStart(2, ' ')} : ${line}`)
  }
  if (limit < matchdays.length) {
    console.log(`... (${matchdays.length - limit} pekan lagi, pakai --all untuk lihat semua)`)
  }
}

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

try {
  const { rows: players } = await client.query('select id, name from league_players order by id')
  if (players.length === 0) throw new Error('league_players kosong')

  const ids = players.map((player) => player.id)
  const matchdays = balanceVenues(packMatchdays(ids))
  const checks = validate(ids, matchdays)

  console.log(`Pemain: ${players.length} (id ${ids[0]}-${ids[ids.length - 1]})`)
  console.log(
    `Jadwal: ${matchdays.length} pekan x ${new Set(matchdays.map((day) => day.length)).values().next().value} laga = ${checks.matches} fixture`,
  )
  printMatchdays(matchdays)
  console.log(
    `Cek: pasangan unik ${checks.uniquePairs}/${checks.matches}, laga per pemain ${checks.matchCounts.join('/')}, ` +
      `pekan ringan per pemain ${checks.lightWeeks.join('/')}, kandang ${checks.homeRange[0]}-${checks.homeRange[1]}`,
  )

  if (checks.problems.length > 0) throw new Error(`jadwal tidak valid: ${checks.problems.join('; ')}`)

  if (!apply) {
    console.log('\nPreview saja. Jalankan dengan --apply untuk menulis ke league_matches.')
  } else {
    const { rows: existing } = await client.query('select * from league_matches order by id')
    const backupPath = join(
      tmpdir(),
      `pti-league-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    )
    writeFileSync(
      backupPath,
      JSON.stringify({ exportedAt: new Date().toISOString(), players, matches: existing }, null, 2),
    )
    console.log(`\nBackup ${existing.length} fixture lama: ${backupPath}`)

    await client.query('begin')
    await client.query('truncate league_matches restart identity')
    const values = []
    const params = []
    let index = 1
    for (const [roundIndex, round] of matchdays.entries()) {
      for (const [home, away] of round) {
        values.push(`($${index++}, $${index++}, $${index++}, now())`)
        params.push(roundIndex + 1, home, away)
      }
    }
    await client.query(
      `insert into league_matches (matchday, home_player_id, away_player_id, created_at)
       values ${values.join(', ')}`,
      params,
    )
    await client.query('commit')

    const { rows: stored } = await client.query(
      'select matchday, home_player_id, away_player_id from league_matches order by matchday, id',
    )
    const byWeek = stored.reduce((acc, row) => {
      const round = acc[row.matchday - 1] ?? (acc[row.matchday - 1] = [])
      round.push([row.home_player_id, row.away_player_id])
      return acc
    }, [])
    const after = validate(ids, byWeek)
    const { rows: total } = await client.query(
      `select count(*)::int as total,
              count(*) filter (where leg1_home is not null or leg1_away is not null
                                  or leg2_home is not null or leg2_away is not null)::int as with_scores,
              min(id)::int as first_id, max(id)::int as last_id
       from league_matches`,
    )
    console.log(
      `Tersimpan: ${total[0].total} fixture (id ${total[0].first_id}-${total[0].last_id}), ` +
        `berskor ${total[0].with_scores}, pasangan unik ${after.uniquePairs}, masalah ${after.problems.length}`,
    )
  }
} finally {
  await client.end()
}
