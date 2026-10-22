import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const leaguePlayers = pgTable('league_players', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  department: text('department').notNull(),
  ovr: integer('ovr').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const leagueMatches = pgTable('league_matches', {
  id: serial('id').primaryKey(),
  matchday: integer('matchday').notNull(),
  homePlayerId: integer('home_player_id').notNull(),
  awayPlayerId: integer('away_player_id').notNull(),
  leg1Home: integer('leg1_home'),
  leg1Away: integer('leg1_away'),
  leg2Home: integer('leg2_home'),
  leg2Away: integer('leg2_away'),
  leg1Wo: text('leg1_wo'),
  leg2Wo: text('leg2_wo'),
  extraResult: text('extra_result'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
