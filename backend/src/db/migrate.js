/**
 * Migration runner: applies migrations/*.sql once each, in filename order,
 * each inside a transaction, recorded in schema_migrations.
 *
 *   node src/db/migrate.js        (or: npm run migrate)
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadConfig } from '../config.js'
import { createPool } from './pool.js'

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
)

export async function runMigrations(pool, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
  )

  const files = (await readdir(dir))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  const appliedNow = []
  for (const name of files) {
    if (applied.has(name)) continue
    const sql = await readFile(path.join(dir, name), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
      appliedNow.push(name)
      log(`applied ${name}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw new Error(`Migration ${name} failed: ${error.message}`, { cause: error })
    } finally {
      client.release()
    }
  }
  return { applied: appliedNow, skipped: files.length - appliedNow.length }
}

async function main() {
  const config = loadConfig()
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is required. Copy .env.example to .env and configure it.')
    process.exit(1)
  }
  const pool = createPool(config)
  try {
    const result = await runMigrations(pool, { log: (message) => console.log(`migrate: ${message}`) })
    console.log(
      result.applied.length === 0
        ? `migrate: database already up to date (${result.skipped} migration(s) applied previously)`
        : `migrate: applied ${result.applied.length} migration(s)`,
    )
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`migrate failed: ${error.message}`)
    process.exit(1)
  })
}
