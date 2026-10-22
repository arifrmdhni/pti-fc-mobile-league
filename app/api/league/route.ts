import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leagueMatches, leaguePlayers } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { getAdminSession } from '@/lib/auth'
import { isMatchdayUnlocked, matchdayUnlockAt } from '@/lib/schedule'
import { aggregateStandings, effectiveLeg, normalizeWalkover } from '@/lib/standings'

// Club crests shown instead of initials. Keys must match league_players.name exactly.
const CLUB_LOGOS: Record<string, string> = {
  QenRazer: '/teams/inter.png',
  Baponza: '/teams/blackburn.png',
  Ghozi: '/teams/arsenal.png',
  Shikma: '/teams/chelsea.png',
  Cavalera: '/teams/celtic.png',
  Wallbett: '/teams/psg.png',
  Sliveddereht: '/teams/juventus.png',
  starscream: '/teams/ajax.png',
  YoungBoyz: '/teams/vasco.png',
  Tuturuull: '/teams/lincoln.png',
  ADK_08: '/teams/dc-united.png',
  BloodyHell: '/teams/santos.png',
  Danang: '/teams/psv.png',
  'fins.jakarta': '/teams/man-united.png',
  PSGM: '/teams/persija.png',
  Denay32: '/teams/liverpool.png',
  berakk: '/teams/indonesia.png',
  riskaymaul: '/teams/benevento.png',
}

export async function GET() {
  const [rows, matches] = await Promise.all([
    db.select().from(leaguePlayers).orderBy(asc(leaguePlayers.id)),
    db.select().from(leagueMatches).orderBy(asc(leagueMatches.matchday), asc(leagueMatches.id)),
  ])

  // Each leg counts as its own match; walkovers are handled inside the aggregator.
  const table = aggregateStandings(matches)

  const players = rows.map((player) => {
    const standing = table.get(player.id)
    return {
      id: player.id,
      name: player.name,
      dept: player.department,
      avatar: player.name.slice(0, 2).toUpperCase(),
      logo: CLUB_LOGOS[player.name] ?? null,
      p: standing?.p ?? 0,
      w: standing?.w ?? 0,
      d: standing?.d ?? 0,
      l: standing?.l ?? 0,
      gf: standing?.gf ?? 0,
      ga: standing?.ga ?? 0,
      cs: standing?.cs ?? 0,
      wo: standing?.wo ?? 0,
      form: standing?.form.slice(-5) ?? [],
    }
  })

  const fixtures = matches.map((match) => {
    const leg1Wo = normalizeWalkover(match.leg1Wo)
    const leg2Wo = normalizeWalkover(match.leg2Wo)
    return {
      id: match.id,
      week: match.matchday,
      home: match.homePlayerId,
      away: match.awayPlayerId,
      leg1: effectiveLeg(leg1Wo, match.leg1Home, match.leg1Away),
      leg2: effectiveLeg(leg2Wo, match.leg2Home, match.leg2Away),
      leg1Wo,
      leg2Wo,
      extraResult: match.extraResult,
    }
  })

  return NextResponse.json({ players, fixtures })
}

export async function PATCH(request: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const id = Number(body.id)
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid match id' }, { status: 400 })

  const [match] = await db
    .select({ matchday: leagueMatches.matchday })
    .from(leagueMatches)
    .where(eq(leagueMatches.id, id))
    .limit(1)
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (!isMatchdayUnlocked(match.matchday)) {
    return NextResponse.json(
      {
        error: 'Matchday locked',
        matchday: match.matchday,
        unlockAt: new Date(matchdayUnlockAt(match.matchday)).toISOString(),
      },
      { status: 403 },
    )
  }

  // A walkover overrides the stored score for that leg.
  const leg1Wo = normalizeWalkover(body.leg1Wo)
  const leg2Wo = normalizeWalkover(body.leg2Wo)
  const score = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null

  const values = {
    leg1Home: leg1Wo ? null : score(body.leg1Home),
    leg1Away: leg1Wo ? null : score(body.leg1Away),
    leg2Home: leg2Wo ? null : score(body.leg2Home),
    leg2Away: leg2Wo ? null : score(body.leg2Away),
    leg1Wo,
    leg2Wo,
    extraResult: typeof body.extraResult === 'string' ? body.extraResult.slice(0, 120) : null,
  }

  await db.update(leagueMatches).set(values).where(eq(leagueMatches.id, id))
  return NextResponse.json({ ok: true })
}
