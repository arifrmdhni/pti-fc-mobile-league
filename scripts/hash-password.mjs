#!/usr/bin/env node
// Usage: node scripts/hash-password.mjs "new-password"
// Prints the ADMIN_PASSWORD_HASH value to paste into .env.local.
// Format must stay in sync with hashPassword() in lib/auth.ts.
// Note: no `$` separators — @next/env expands `$name` inside .env values.
import { randomBytes, scryptSync } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "new-password"')
  process.exit(1)
}

const salt = randomBytes(16).toString('hex')
const hash = scryptSync(password, salt, 64).toString('hex')
console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt}:${hash}`)
