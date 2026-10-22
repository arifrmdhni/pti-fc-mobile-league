// Matchday unlock schedule. One matchday opens every Thursday at 11:00 WIB
// (UTC+7, no DST). Shared by the client UI and the PATCH route guard.

export const MATCHDAY_COUNT = 9

// First matchday opens Thursday 22 October 2026, 11:00 WIB.
export const FIRST_UNLOCK_MS = Date.parse('2026-10-22T11:00:00+07:00')

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function matchdayUnlockAt(matchday: number): number {
  return FIRST_UNLOCK_MS + (matchday - 1) * WEEK_MS
}

export function isMatchdayUnlocked(matchday: number, now = Date.now()): boolean {
  return matchday >= 1 && now >= matchdayUnlockAt(matchday)
}

export function latestUnlockedMatchday(now = Date.now()): number {
  if (now < FIRST_UNLOCK_MS) return 0
  return Math.min(MATCHDAY_COUNT, Math.floor((now - FIRST_UNLOCK_MS) / WEEK_MS) + 1)
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  day: 'numeric',
  month: 'short',
})

const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatMatchdayUnlock(matchday: number): string {
  const date = new Date(matchdayUnlockAt(matchday))
  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)} WIB`
}
