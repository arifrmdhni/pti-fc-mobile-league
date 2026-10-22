// Standings aggregation. Every leg counts as its own match, and a leg can be a
// walkover: one player missing (opponent wins 3-0, both get a -3 penalty for the
// player who forfeited) or both missing (0-0, both get -3, no winner).

export type FormResult = 'W' | 'D' | 'L'
export type Walkover = 'home' | 'away' | 'both'

export type Standing = {
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  cs: number
  wo: number
  form: FormResult[]
}

export type MatchForStandings = {
  homePlayerId: number
  awayPlayerId: number
  leg1Home: number | null
  leg1Away: number | null
  leg2Home: number | null
  leg2Away: number | null
  leg1Wo: string | null
  leg2Wo: string | null
}

export function normalizeWalkover(value: unknown): Walkover | null {
  return value === 'home' || value === 'away' || value === 'both' ? value : null
}

export function emptyStanding(): Standing {
  return { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, cs: 0, wo: 0, form: [] }
}

/** Points: win 3, draw 1, loss 0, minus 3 for every forfeited leg. */
export function pointsFor(standing: Pick<Standing, 'w' | 'd' | 'wo'>): number {
  return standing.w * 3 + standing.d - standing.wo * 3
}

/** Score shown for a leg: derived from the walkover flag, or the stored score. */
export function effectiveLeg(
  wo: Walkover | null,
  home: number | null,
  away: number | null,
): [number, number] | null {
  if (wo === 'home') return [0, 3]
  if (wo === 'away') return [3, 0]
  if (wo === 'both') return [0, 0]
  return home === null || away === null ? null : [home, away]
}

function applyLeg(
  standingFor: (playerId: number) => Standing,
  homePlayerId: number,
  awayPlayerId: number,
  homeGoals: number | null,
  awayGoals: number | null,
  wo: Walkover | null,
) {
  const home = standingFor(homePlayerId)
  const away = standingFor(awayPlayerId)

  if (wo === 'both') {
    // Nobody played: no goals, no winner, both forfeit a leg (-3 each).
    home.p += 1
    away.p += 1
    home.wo += 1
    away.wo += 1
    return
  }

  if (wo === 'home' || wo === 'away') {
    const forfeit = wo === 'home' ? home : away
    const winner = wo === 'home' ? away : home
    winner.p += 1
    winner.w += 1
    winner.gf += 3
    winner.cs += 1
    winner.form.push('W')
    forfeit.p += 1
    forfeit.l += 1
    forfeit.ga += 3
    forfeit.wo += 1
    forfeit.form.push('L')
    return
  }

  if (homeGoals === null || awayGoals === null) return

  home.p += 1
  home.gf += homeGoals
  home.ga += awayGoals
  away.p += 1
  away.gf += awayGoals
  away.ga += homeGoals

  // A clean sheet is a completed leg where the opponent scored nothing.
  if (awayGoals === 0) home.cs += 1
  if (homeGoals === 0) away.cs += 1

  if (homeGoals > awayGoals) {
    home.w += 1
    away.l += 1
    home.form.push('W')
    away.form.push('L')
  } else if (homeGoals < awayGoals) {
    away.w += 1
    home.l += 1
    away.form.push('W')
    home.form.push('L')
  } else {
    home.d += 1
    away.d += 1
    home.form.push('D')
    away.form.push('D')
  }
}

export function aggregateStandings(matches: MatchForStandings[]): Map<number, Standing> {
  const table = new Map<number, Standing>()
  const standingFor = (playerId: number) => {
    let standing = table.get(playerId)
    if (!standing) {
      standing = emptyStanding()
      table.set(playerId, standing)
    }
    return standing
  }

  for (const match of matches) {
    applyLeg(
      standingFor,
      match.homePlayerId,
      match.awayPlayerId,
      match.leg1Home,
      match.leg1Away,
      normalizeWalkover(match.leg1Wo),
    )
    applyLeg(
      standingFor,
      match.homePlayerId,
      match.awayPlayerId,
      match.leg2Home,
      match.leg2Away,
      normalizeWalkover(match.leg2Wo),
    )
  }

  return table
}
