import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const ADMIN_COOKIE = 'pti_admin'
export const SESSION_TTL_SECONDS = 12 * 60 * 60

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 10

export type AdminSession = { username: string }

type RateLimitEntry = { count: number; resetAt: number }

const globalForAuth = globalThis as unknown as { leagueLoginAttempts?: Map<string, RateLimitEntry> }
const loginAttempts = globalForAuth.leagueLoginAttempts ?? new Map<string, RateLimitEntry>()
if (process.env.NODE_ENV !== 'production') globalForAuth.leagueLoginAttempts = loginAttempts

/** Format: scrypt:<salt hex>:<hash hex>. Keep scripts/hash-password.mjs in sync.
 *  Do not use `$` as the separator: @next/env expands `$name` inside .env values. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  if (expected.length === 0) return false
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set')
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
}

export function createSessionToken(username: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: username, exp: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readSessionToken(token: string | undefined): AdminSession | null {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: unknown; exp?: unknown }
    if (typeof data.sub !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return { username: data.sub }
  } catch {
    return null
  }
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies()
  return readSessionToken(store.get(ADMIN_COOKIE)?.value)
}

export function checkLoginRateLimit(key: string): { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now()
  const entry = loginAttempts.get(key)

  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return { ok: true, remaining: LOGIN_MAX_ATTEMPTS - 1 }
  }

  entry.count += 1
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    return { ok: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { ok: true, remaining: LOGIN_MAX_ATTEMPTS - entry.count }
}
