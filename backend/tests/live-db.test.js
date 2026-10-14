/**
 * Live PostgreSQL tests: migrations + real repository against a real server.
 *
 * Database selection:
 *  - TEST_DATABASE_URL (a dedicated test database!) if set;
 *  - otherwise an embedded PostgreSQL 17 started in a temp directory via the
 *    `embedded-postgres` dev dependency (skipped cleanly if unavailable).
 *
 * Never touches real user data: the embedded instance is disposable and
 * TEST_DATABASE_URL is the operator's explicit opt-in.
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { loadConfig } from '../src/config.js'
import { runMigrations } from '../src/db/migrate.js'
import { createPool } from '../src/db/pool.js'
import { createRepo } from '../src/db/repo.js'
import { VALID_DECISION } from './helpers.js'

let pool = null
let repo = null
let stopDb = async () => {}
let skipReason = null

const externalUrl = (process.env.TEST_DATABASE_URL ?? '').trim()

before(async () => {
  if (externalUrl) {
    pool = createPool({ ...loadConfig({ DATABASE_URL: externalUrl }), poolMax: 4 })
    await pool.query('SELECT 1')
  } else {
    try {
      const { default: EmbeddedPostgres } = await import('embedded-postgres')
      const dataDir = path.join(os.tmpdir(), `drp-pg-${process.pid}-${Date.now()}`)
      const port = 56000 + Math.floor(Math.random() * 1000)
      const pg = new EmbeddedPostgres({
        databaseDir: dataDir,
        user: 'postgres',
        password: 'test-password',
        port,
        persistent: false,
      })
      await pg.initialise()
      await pg.start()
      await pg.createDatabase('drp_test')
      stopDb = () => pg.stop()
      pool = createPool({
        ...loadConfig({
          DATABASE_URL: `postgresql://postgres:test-password@127.0.0.1:${port}/drp_test`,
        }),
        poolMax: 4,
      })
      await pool.query('SELECT 1')
    } catch (error) {
      skipReason = `PostgreSQL unavailable in this environment (${error.message.split('\n')[0]})`
      return
    }
  }
  await runMigrations(pool)
  repo = createRepo(pool)
})

after(async () => {
  if (pool) await pool.end().catch(() => {})
  await stopDb()
})

const opts = () => (skipReason ? { skip: skipReason } : {})

test('migrations apply and are recorded', opts(), async () => {
  const { rows } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('decisions', 'decision_outcomes', 'predictions')")
  assert.deepEqual(
    rows.map((row) => row.table_name).sort(),
    ['decision_outcomes', 'decisions', 'predictions'],
  )
  const applied = await pool.query('SELECT name FROM schema_migrations')
  assert.ok(applied.rows.some((row) => row.name === '001_init.sql'))

  // Re-running is a no-op.
  const rerun = await runMigrations(pool)
  assert.deepEqual(rerun.applied, [])
})

test('decision round-trip including hostile-looking text (parameterized)', opts(), async () => {
  const hostile = "Robert'); DROP TABLE decisions;-- \"quoted\" ; 100% --"
  const created = await repo.createDecision({
    ...VALID_DECISION,
    title: hostile,
    decision_date: '2026-01-05',
  })
  const fetched = await repo.getDecision(created.id)
  assert.equal(fetched.title, hostile, 'text round-trips byte-for-byte — no SQL injection surface')
  assert.equal(fetched.category, VALID_DECISION.category)
  assert.equal(fetched.decision_date, '2026-01-05')

  // A literal search string also stays inert.
  const { rows } = await pool.query('SELECT * FROM decisions WHERE title = $1', [hostile])
  assert.equal(rows.length, 1)
})

test('list decisions is newest-first with a total count', opts(), async () => {
  const a = await repo.createDecision({ ...VALID_DECISION, title: 'First listed decision' })
  await new Promise((resolve) => setTimeout(resolve, 5))
  const b = await repo.createDecision({ ...VALID_DECISION, title: 'Second listed decision' })
  const { rows, totalCount } = await repo.listDecisions({ limit: 10, offset: 0 })
  assert.ok(totalCount >= 2)
  assert.equal(rows[0].id, b.id)
  assert.equal(rows[1].id, a.id)
  assert.ok('outcome_value' in rows[0], 'outcome join shape matches the API serializer')
})

test('outcomes upsert updates in place; unknown stays unknown', opts(), async () => {
  const decision = await repo.createDecision({ ...VALID_DECISION, decision_date: '2026-01-05' })

  const first = await repo.upsertOutcome(decision.id, {
    outcome: 'reversed',
    outcome_date: '2026-02-01',
    note: 'Reconsidered after board feedback',
  })
  const updated = await repo.upsertOutcome(decision.id, {
    outcome: 'unknown',
    outcome_date: null,
    note: null,
  })
  assert.equal(updated.id, first.id, 'same row updated, not duplicated')
  assert.equal(updated.outcome, 'unknown')
  assert.equal(updated.outcome_date, null)

  const count = await pool.query('SELECT count(*)::int AS n FROM decision_outcomes WHERE decision_id = $1', [decision.id])
  assert.equal(count.rows[0].n, 1, 'one current outcome per decision')
})

test('database constraints reject invalid data at the SQL level', opts(), async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO decisions (title, category, estimated_cost_usd, num_alternatives,
        confidence_level, business_context, expected_benefits, identified_risks)
       VALUES ('Bad cost decision', 'Hiring', -1, 2, 'Low', 'Context text long enough here', 'Benefits text long enough here', 'Risks text long enough here')`,
    ),
    (error) => error.code === '23514',
  )

  await assert.rejects(
    pool.query(
      `INSERT INTO decision_outcomes (decision_id, outcome, outcome_date)
       VALUES (999999999, 'reversed', '2026-01-01')`,
    ),
    (error) => error.code === '23503',
  )

  const decision = await repo.createDecision({ ...VALID_DECISION })
  await repo.upsertOutcome(decision.id, { outcome: 'unknown', outcome_date: null, note: null })
  await assert.rejects(
    pool.query(
      `INSERT INTO decision_outcomes (decision_id, outcome, outcome_date)
       VALUES ($1, 'reversed', '2026-02-02')`,
      [decision.id],
    ),
    (error) => error.code === '23505',
    'UNIQUE(decision_id) prevents a second outcome row',
  )

  // DB-level rule: a known outcome must carry a date.
  await assert.rejects(
    pool.query(
      `INSERT INTO decision_outcomes (decision_id, outcome, outcome_date)
       VALUES ($1, 'reversed', NULL)`,
      [decision.id],
    ),
    (error) => error.code === '23514',
  )
})

test('predictions persist with probability bounds and verbatim provider_response', opts(), async () => {
  const decision = await repo.createDecision({ ...VALID_DECISION })
  const providerResponse = {
    probability_of_reversal: 0.37,
    probability_percent: 37.0,
    predicted_class: 0,
    predicted_label: 'Not reversed',
    threshold: 0.5,
    dataset: 'synthetic',
    disclaimer: 'Experimental prototype: trained on a small synthetic dataset.',
  }
  const saved = await repo.insertPrediction(decision.id, {
    ...providerResponse,
    provider_response: providerResponse,
  })
  assert.ok(saved.id)
  assert.equal(saved.probability_of_reversal, 0.37)
  assert.deepEqual(saved.provider_response, providerResponse, 'JSONB preserved verbatim')

  const listed = await repo.listPredictions(decision.id)
  assert.equal(listed.length, 1)

  // Probability bounds are enforced by the database, not just application code.
  await assert.rejects(
    pool.query(
      `INSERT INTO predictions (decision_id, probability_of_reversal, probability_percent,
        predicted_class, predicted_label, provider_response)
       VALUES ($1, 1.5, 150, 0, 'Not reversed', '{}'::jsonb)`,
      [decision.id],
    ),
    (error) => error.code === '23514',
  )

  // Deleting a decision cascades to its outcome and predictions.
  await repo.upsertOutcome(decision.id, { outcome: 'unknown', outcome_date: null, note: null })
  await pool.query('DELETE FROM decisions WHERE id = $1', [decision.id])
  const orphans = await pool.query(
    'SELECT (SELECT count(*)::int FROM decision_outcomes WHERE decision_id = $1) AS o, (SELECT count(*)::int FROM predictions WHERE decision_id = $1) AS p',
    [decision.id],
  )
  assert.equal(orphans.rows[0].o, 0)
  assert.equal(orphans.rows[0].p, 0)
})
