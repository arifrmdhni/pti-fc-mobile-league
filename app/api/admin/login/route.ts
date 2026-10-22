import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, SESSION_TTL_SECONDS, checkLoginRateLimit, createSessionToken, verifyPassword } from '@/lib/auth'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const limit = checkLoginRateLimit(`login:${ip}`)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const expectedUsername = process.env.ADMIN_USERNAME
  const expectedHash = process.env.ADMIN_PASSWORD_HASH

  if (!expectedUsername || !expectedHash || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: 'Admin login is not configured on the server' }, { status: 503 })
  }

  // Verify the password even when the username is wrong, so timing doesn't reveal which field failed.
  const passwordOk = verifyPassword(password, expectedHash)
  const usernameOk = username === expectedUsername

  if (!usernameOk || !passwordOk || password.length === 0) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, username })
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: createSessionToken(expectedUsername),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  return response
}
