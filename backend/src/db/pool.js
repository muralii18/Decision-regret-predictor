/** PostgreSQL connection pool (pg). Connections are pooled and released
 * automatically by pg; callers use pool.query and never hold clients. */
import pg from 'pg'

// Keep DATE columns as 'YYYY-MM-DD' strings, matching the ML schema and the
// frontend contract (pg would otherwise convert them to JS Date objects,
// which shift across time zones). TIMESTAMPTZ columns still parse to Date.
pg.types.setTypeParser(1082, (value) => value)

export function createPool(config) {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
}
