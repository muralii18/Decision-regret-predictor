/** HTTP-level tests: the real Express app with an in-memory repository and
 * a real fake ML HTTP server (FastAPI contract). No PostgreSQL required. */
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createApp } from '../src/app.js'
import { MlClient } from '../src/ml/client.js'
import {
  closedPort,
  createFakeRepo,
  ML_SUCCESS_BODY,
  startFakeMlServer,
  testConfig,
  VALID_DECISION,
  withAppServer,
} from './helpers.js'

const silentLogger = { error() {}, log() {} }

let repo
let mlServer
let app

const goodHandler = async () => ({ status: 200, body: ML_SUCCESS_BODY })

after(async () => {
  if (mlServer) await mlServer.close()
})

beforeEach(async () => {
  repo = createFakeRepo()
  if (mlServer) await mlServer.close()
  mlServer = await startFakeMlServer(goodHandler)
  const ml = new MlClient({ baseUrl: mlServer.baseUrl, timeoutMs: 1000 })
  app = createApp({ repo, ml, config: testConfig({ mlServiceUrl: mlServer.baseUrl }), logger: silentLogger })
})

async function createDecision(base, overrides) {
  const response = await fetch(`${base}/api/decisions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...VALID_DECISION, ...overrides }),
  })
  return response
}

test('GET /health reports ok and ML configured', async () => {
  await withAppServer(app, async (base) => {
    const response = await fetch(`${base}/health`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.status, 'ok')
    assert.equal(body.database, 'ok')
    assert.equal(body.ml_service, 'configured')
  })
})

test('GET /health degrades honestly when the database is unreachable', async () => {
  repo.setFailing(true)
  await withAppServer(app, async (base) => {
    const body = await (await fetch(`${base}/health`)).json()
    assert.equal(body.status, 'degraded')
    assert.equal(body.database, 'unavailable')
  })
})

test('GET /health without ?ml=1 never contacts the ML service', async () => {
  await withAppServer(app, async (base) => {
    const body = await (await fetch(`${base}/health`)).json()
    assert.equal(body.ml_service, 'configured')
    assert.equal(body.ml_probed, false)
    assert.equal(body.ml_model_loaded, undefined)
    assert.equal(mlServer.requests.length, 0)
  })
})

test('GET /health?ml=1 probes the ML service and reports the model loaded', async () => {
  if (mlServer) await mlServer.close()
  mlServer = await startFakeMlServer(async ({ url }) => {
    if (url.startsWith('/health')) {
      return {
        status: 200,
        body: { status: 'ok', model_loaded: true, detail: 'Service is reachable and the trained model is loaded.' },
      }
    }
    return { status: 200, body: ML_SUCCESS_BODY }
  })
  const ml = new MlClient({ baseUrl: mlServer.baseUrl, timeoutMs: 1000 })
  app = createApp({ repo, ml, config: testConfig({ mlServiceUrl: mlServer.baseUrl }), logger: silentLogger })

  await withAppServer(app, async (base) => {
    const body = await (await fetch(`${base}/health?ml=1`)).json()
    assert.equal(body.status, 'ok')
    assert.equal(body.database, 'ok')
    assert.equal(body.ml_probed, true)
    assert.equal(body.ml_service, 'ok')
    assert.equal(body.ml_model_loaded, true)
    assert.equal(mlServer.requests.filter((r) => r.url.startsWith('/health')).length, 1)
  })
})

test('GET /health?ml=1 reports no_model when the service has no trained artifact', async () => {
  if (mlServer) await mlServer.close()
  mlServer = await startFakeMlServer(async ({ url }) => {
    if (url.startsWith('/health')) {
      return {
        status: 200,
        body: { status: 'ok', model_loaded: false, detail: 'Service is reachable, but no trained model artifact is available.' },
      }
    }
    return { status: 200, body: ML_SUCCESS_BODY }
  })
  const ml = new MlClient({ baseUrl: mlServer.baseUrl, timeoutMs: 1000 })
  app = createApp({ repo, ml, config: testConfig({ mlServiceUrl: mlServer.baseUrl }), logger: silentLogger })

  await withAppServer(app, async (base) => {
    const body = await (await fetch(`${base}/health?ml=1`)).json()
    // The ML service answers, but predictions would 503 — not "available".
    assert.equal(body.ml_service, 'no_model')
    assert.equal(body.ml_model_loaded, false)
  })
})

test('GET /health?ml=1 reports unreachable when the ML service is down', async () => {
  const downPort = await closedPort()
  const downApp = createApp({
    repo,
    ml: new MlClient({ baseUrl: `http://127.0.0.1:${downPort}`, timeoutMs: 300 }),
    config: testConfig({ mlServiceUrl: `http://127.0.0.1:${downPort}` }),
    logger: silentLogger,
  })
  await withAppServer(downApp, async (base) => {
    const body = await (await fetch(`${base}/health?ml=1`)).json()
    assert.equal(body.status, 'ok') // backend + database are fine
    assert.equal(body.ml_service, 'unreachable') // but the ML service is not
    assert.equal(body.ml_model_loaded, false)
  })
})

test('GET /health?ml=1 with no ML URL configured reports not_configured', async () => {
  const noMlApp = createApp({
    repo,
    ml: new MlClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 300 }),
    config: testConfig({ mlServiceUrl: '' }),
    logger: silentLogger,
  })
  await withAppServer(noMlApp, async (base) => {
    const body = await (await fetch(`${base}/health?ml=1`)).json()
    assert.equal(body.ml_service, 'not_configured')
    assert.equal(body.ml_model_loaded, undefined)
  })
})

test('POST /api/decisions creates and echoes a valid decision', async () => {
  await withAppServer(app, async (base) => {
    const response = await createDecision(base)
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.ok(body.id)
    assert.equal(body.title, VALID_DECISION.title)
    assert.equal(body.estimated_cost_usd, VALID_DECISION.estimated_cost_usd)
    assert.equal(body.decision_date, new Date().toISOString().slice(0, 10))
  })
})

test('POST /api/decisions rejects invalid payloads with field details', async () => {
  await withAppServer(app, async (base) => {
    const cases = [
      { ...VALID_DECISION, category: 'Picking Lunch' },
      { ...VALID_DECISION, estimated_cost_usd: 0 },
      { ...VALID_DECISION, num_alternatives: -1 },
      { ...VALID_DECISION, confidence_level: 'Sure' },
      { ...VALID_DECISION, title: 'x' },
      { ...VALID_DECISION, business_context: 'short' },
      { ...VALID_DECISION, target_reversed: 1 }, // leakage guard
    ]
    for (const payload of cases) {
      const response = await createDecision(base, payload)
      assert.equal(response.status, 400, JSON.stringify(payload).slice(0, 60))
      const body = await response.json()
      assert.equal(body.error, 'validation_failed')
      assert.ok(Array.isArray(body.details) && body.details.length > 0)
      assert.equal(repo.decisions.size, 0, 'nothing must be persisted')
    }

    // Missing fields entirely (not merged over a valid payload).
    const missing = await fetch(`${base}/api/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'Hiring' }),
    })
    assert.equal(missing.status, 400)
    const missingBody = await missing.json()
    assert.equal(missingBody.error, 'validation_failed')
    assert.ok(missingBody.details.length >= 5, 'every missing field is reported')
    assert.equal(repo.decisions.size, 0)
  })
})

test('GET /api/decisions lists newest first with pagination', async () => {
  await withAppServer(app, async (base) => {
    const first = await (await createDecision(base)).json()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await createDecision(base)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const third = await (await createDecision(base)).json()

    const page = await (await fetch(`${base}/api/decisions?limit=2`)).json()
    assert.equal(page.data.length, 2)
    assert.equal(page.data[0].id, third.id, 'newest first')
    assert.equal(page.pagination.total, 3)

    const next = await (await fetch(`${base}/api/decisions?limit=2&offset=2`)).json()
    assert.equal(next.data[0].id, first.id)

    const bad = await fetch(`${base}/api/decisions?limit=abc`)
    assert.equal(bad.status, 400)
  })
})

test('GET /api/decisions/:id returns decision with outcome and predictions', async () => {
  await withAppServer(app, async (base) => {
    const created = await (await createDecision(base)).json()
    const response = await fetch(`${base}/api/decisions/${created.id}`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.id, created.id)
    assert.equal(body.outcome, null)
    assert.deepEqual(body.predictions, [])

    assert.equal((await fetch(`${base}/api/decisions/9999`)).status, 404)
    assert.equal((await fetch(`${base}/api/decisions/not-a-number`)).status, 400)
  })
})

test('outcomes: record, update, and preserve unknown as unknown', async () => {
  await withAppServer(app, async (base) => {
    const decision = await (await createDecision(base, { decision_date: '2026-01-10' })).json()

    // Record a reversal.
    const reversed = await fetch(`${base}/api/decisions/${decision.id}/outcomes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'reversed', outcome_date: '2026-03-01', note: 'Supplier went bankrupt' }),
    })
    assert.equal(reversed.status, 200)
    assert.equal((await reversed.json()).outcome, 'reversed')

    // Update to unknown — must persist as unknown with no date, never as
    // not_reversed.
    const unknown = await fetch(`${base}/api/decisions/${decision.id}/outcomes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'unknown' }),
    })
    assert.equal(unknown.status, 200)
    const stored = await unknown.json()
    assert.equal(stored.outcome, 'unknown')
    assert.equal(stored.outcome_date, null)

    const fetched = await (await fetch(`${base}/api/decisions/${decision.id}`)).json()
    assert.equal(fetched.outcome.outcome, 'unknown')

    // Invalid outcomes and dates.
    const badCases = [
      { outcome: 'maybe' },
      { outcome: 'reversed' }, // missing date
      { outcome: 'reversed', outcome_date: '2019-01-01' }, // before decision
      { outcome: 'reversed', outcome_date: '2999-01-01' }, // future
      { outcome: 'unknown', outcome_date: '2026-03-01' }, // date on unknown
    ]
    for (const payload of badCases) {
      const response = await fetch(`${base}/api/decisions/${decision.id}/outcomes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      assert.equal(response.status, 400, JSON.stringify(payload))
    }

    assert.equal(
      (await fetch(`${base}/api/decisions/9999/outcomes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'unknown' }),
      })).status,
      404,
    )
  })
})

test('predictions: genuine ML response is persisted with disclaimer', async () => {
  await withAppServer(app, async (base) => {
    const decision = await (await createDecision(base)).json()
    const response = await fetch(`${base}/api/decisions/${decision.id}/predictions`, { method: 'POST' })
    assert.equal(response.status, 201)
    const saved = await response.json()
    assert.equal(saved.probability_of_reversal, ML_SUCCESS_BODY.probability_of_reversal)
    assert.equal(saved.predicted_label, ML_SUCCESS_BODY.predicted_label)
    assert.equal(saved.disclaimer, ML_SUCCESS_BODY.disclaimer)
    assert.deepEqual(saved.provider_response, ML_SUCCESS_BODY)

    // The ML service received exactly the seven features — no id, dates or
    // labels — via the real HTTP boundary.
    assert.equal(mlServer.requests.length, 1)
    assert.deepEqual(
      Object.keys(mlServer.requests[0].body).sort(),
      [
        'business_context',
        'category',
        'confidence_level',
        'estimated_cost_usd',
        'expected_benefits',
        'identified_risks',
        'num_alternatives',
      ],
    )

    const list = await (await fetch(`${base}/api/decisions/${decision.id}/predictions`)).json()
    assert.equal(list.data.length, 1)
  })
})

test('predictions: ML model missing (503) -> safe 503, nothing persisted', async () => {
  await mlServer.close()
  mlServer = await startFakeMlServer(async () => ({
    status: 503,
    body: { detail: 'The model is not available on this server. Train it first (see ml/README.md).' },
  }))
  const ml = new MlClient({ baseUrl: mlServer.baseUrl, timeoutMs: 1000 })
  const localApp = createApp({ repo, ml, config: testConfig(), logger: silentLogger })

  await withAppServer(localApp, async (base) => {
    const decision = await (await createDecision(base)).json()
    const response = await fetch(`${base}/api/decisions/${decision.id}/predictions`, { method: 'POST' })
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.match(body.message, /model is not available/)
    assert.equal(repo.predictions.size, 0)
  })
})

test('predictions: ML service down (real refused connection) -> 503', async () => {
  const port = await closedPort()
  const ml = new MlClient({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 1000 })
  const localApp = createApp({ repo, ml, config: testConfig(), logger: silentLogger })

  await withAppServer(localApp, async (base) => {
    const decision = await (await createDecision(base)).json()
    const response = await fetch(`${base}/api/decisions/${decision.id}/predictions`, { method: 'POST' })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error, 'ml_unavailable')
    assert.equal(repo.predictions.size, 0)
  })
})

test('predictions: malformed ML body -> 502, nothing persisted', async () => {
  await mlServer.close()
  mlServer = await startFakeMlServer(async () => ({
    status: 200,
    body: { probability_of_reversal: 42.0 }, // invalid contract
  }))
  const ml = new MlClient({ baseUrl: mlServer.baseUrl, timeoutMs: 1000 })
  const localApp = createApp({ repo, ml, config: testConfig(), logger: silentLogger })

  await withAppServer(localApp, async (base) => {
    const decision = await (await createDecision(base)).json()
    const response = await fetch(`${base}/api/decisions/${decision.id}/predictions`, { method: 'POST' })
    assert.equal(response.status, 502)
    assert.equal((await response.json()).error, 'ml_bad_response')
    assert.equal(repo.predictions.size, 0, 'invalid responses are never persisted')
  })
})

test('predictions: ML timeout -> 504, nothing persisted', async () => {
  await mlServer.close()
  mlServer = await startFakeMlServer(async () => ({ delayMs: 2000, body: ML_SUCCESS_BODY }))
  const ml = new MlClient({ baseUrl: mlServer.baseUrl, timeoutMs: 100 })
  const localApp = createApp({ repo, ml, config: testConfig(), logger: silentLogger })

  await withAppServer(localApp, async (base) => {
    const decision = await (await createDecision(base)).json()
    const response = await fetch(`${base}/api/decisions/${decision.id}/predictions`, { method: 'POST' })
    assert.equal(response.status, 504)
    assert.equal(repo.predictions.size, 0)
  })
})

test('protocol hygiene: bad JSON 400, oversize 413, unknown route 404, CORS allow-list', async () => {
  await withAppServer(app, async (base) => {
    const badJson = await fetch(`${base}/api/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    assert.equal(badJson.status, 400)
    assert.equal((await badJson.json()).error, 'invalid_json')

    const oversize = await fetch(`${base}/api/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...VALID_DECISION, business_context: 'x'.repeat(200_000) }),
    })
    assert.equal(oversize.status, 413)

    assert.equal((await fetch(`${base}/api/nope`)).status, 404)

    // Allowed Vite origin gets CORS headers; unknown origins do not.
    const allowed = await fetch(`${base}/health`, {
      headers: { origin: 'http://localhost:5173' },
    })
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    const denied = await fetch(`${base}/health`, { headers: { origin: 'http://evil.example' } })
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
  })
})

// ---------------------------------------------------------------------------
// Frontend-contract tests: the exact shapes src/lib/api.js and the React
// views consume. They pin the integration contract without weakening any
// assertion above.
// ---------------------------------------------------------------------------

test('list rows expose the flattened outcome object the history UI renders', async () => {
  await withAppServer(app, async (base) => {
    const created = await (await createDecision(base, { decision_date: '2026-01-05' })).json()

    const before = await (await fetch(`${base}/api/decisions`)).json()
    assert.equal(before.data.length, 1)
    assert.equal(before.data[0].outcome, null, 'no outcome recorded yet')
    assert.equal(before.data[0].title, VALID_DECISION.title)
    assert.ok(before.data[0].decision_date, 'decision_date is a plain ISO date string')
    assert.ok(before.pagination && typeof before.pagination.total === 'number')

    const recorded = await fetch(`${base}/api/decisions/${created.id}/outcomes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'unknown' }),
    })
    assert.equal(recorded.status, 200)

    const after = await (await fetch(`${base}/api/decisions`)).json()
    const row = after.data[0]
    assert.equal(row.outcome.outcome, 'unknown', 'unknown stays unknown in list rows')
    assert.equal(row.outcome.outcome_date, null)
  })
})

test('decision detail carries everything the Results view renders', async () => {
  await withAppServer(app, async (base) => {
    const created = await (await createDecision(base)).json()

    const predictionResponse = await fetch(`${base}/api/decisions/${created.id}/predictions`, {
      method: 'POST',
    })
    assert.equal(predictionResponse.status, 201)

    const detail = await (await fetch(`${base}/api/decisions/${created.id}`)).json()
    for (const field of [
      'id',
      'title',
      'decision_date',
      'category',
      'estimated_cost_usd',
      'num_alternatives',
      'confidence_level',
      'business_context',
      'expected_benefits',
      'identified_risks',
    ]) {
      assert.ok(field in detail, `decision detail must include ${field}`)
    }
    assert.equal(detail.outcome, null)
    assert.equal(detail.predictions.length, 1)

    const prediction = detail.predictions[0]
    assert.equal(prediction.decision_id, created.id)
    assert.equal(prediction.probability_of_reversal, ML_SUCCESS_BODY.probability_of_reversal)
    assert.equal(prediction.probability_percent, ML_SUCCESS_BODY.probability_percent)
    assert.equal(prediction.predicted_class, ML_SUCCESS_BODY.predicted_class)
    assert.equal(prediction.predicted_label, ML_SUCCESS_BODY.predicted_label)
    assert.equal(prediction.disclaimer, ML_SUCCESS_BODY.disclaimer)
    assert.deepEqual(prediction.provider_response, ML_SUCCESS_BODY)
  })
})
