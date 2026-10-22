import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Keep one pool per process. Next dev re-evaluates route modules on edit/reload, and
// without this every reload leaks a pool and pays the ~2s Neon handshake again.
const globalForDb = globalThis as unknown as { leaguePool?: Pool }

export const pool =
  globalForDb.leaguePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    // Neon is ~260ms away from here, so a reconnect costs ~2s. Keep idle
    // connections around far longer than the 10s pg default.
    idleTimeoutMillis: 5 * 60 * 1000,
    connectionTimeoutMillis: 15 * 1000,
    keepAlive: true,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.leaguePool = pool

export const db = drizzle(pool, { schema })
