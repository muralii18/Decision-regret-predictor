/** Tests for src/ml/client.js — payload whitelisting, response validation
 * and safe error mapping. Uses stubbed fetch plus one real AbortSignal
 * timeout test. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MlClient,
  MlServiceError,
  ML_FEATURE_FIELDS,
  toMlFeatures,
  validateMlResponse,
} from '../src/ml/client.js'
import { ML_SUCCESS_BODY, VALID_DECISION } from './helpers.js'

const DECISION_ROW = {
  id: '17',
  title: 'Approve Q4 supplier contract renewal',
  decision_date: '2026-09-01',
  created_at: '2026-09-01T10:00:00Z',
  ...VALID_DECISION,
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('payload contains exactly the seven decision-time features', () => {
  const payload = toMlFeatures(DECISION_ROW)
  assert.deepEqual(Object.keys(payload).sort(), [...ML_FEATURE_FIELDS].sort())
  // Metadata, ids, dates and labels can never leak into the ML request.
  for (const banned of ['id', 'title', 'decision_date', 'created_at', 'target_reversed', 'observation_window_days']) {
    assert.ok(!(banned in payload), `${banned} must not be sent to the ML service`)
  }
})

test('successful response is validated and returned', async () => {
  let sent
  const ml = new MlClient({
    baseUrl: 'http://ml.test/',
    fetchImpl: async (url, init) => {
      sent = { url, body: JSON.parse(init.body) }
      return jsonResponse(ML_SUCCESS_BODY)
    },
  })
  const result = await ml.predict(DECISION_ROW)
  assert.equal(sent.url, 'http://ml.test/predict', 'trailing slash normalized')
  assert.deepEqual(Object.keys(sent.body).sort(), [...ML_FEATURE_FIELDS].sort())
  assert.deepEqual(result, ML_SUCCESS_BODY)
})

test('503 with FastAPI detail maps to ML_UNAVAILABLE and keeps the safe detail', async () => {
  const ml = new MlClient({
    baseUrl: 'http://ml.test',
    fetchImpl: async () =>
      jsonResponse({ detail: 'The model is not available on this server. Train it first (see ml/README.md).' }, 503),
  })
  await assert.rejects(ml.predict(DECISION_ROW), (error) => {
    assert.ok(error instanceof MlServiceError)
    assert.equal(error.code, 'ML_UNAVAILABLE')
    assert.match(error.publicMessage, /no usable model/)
    assert.match(error.publicMessage, /ml\/README\.md/)
    return true
  })
})

test('422 and other upstream errors never leak upstream bodies', async () => {
  const ml = new MlClient({
    baseUrl: 'http://ml.test',
    fetchImpl: async () => jsonResponse({ detail: [{ loc: ['body'], msg: 'internal' }] }, 422),
  })
  await assert.rejects(ml.predict(DECISION_ROW), (error) => {
    assert.equal(error.code, 'ML_REJECTED')
    assert.ok(!error.publicMessage.includes('loc'), 'raw upstream JSON must not be reused')
    return true
  })
})

test('network failure maps to ML_UNAVAILABLE', async () => {
  const ml = new MlClient({
    baseUrl: 'http://ml.test',
    fetchImpl: async () => {
      throw new TypeError('fetch failed')
    },
  })
  await assert.rejects(ml.predict(DECISION_ROW), { code: 'ML_UNAVAILABLE' })
})

test('a genuine slow response hits the timeout (AbortSignal.timeout)', async () => {
  const ml = new MlClient({
    baseUrl: 'http://ml.test',
    timeoutMs: 50,
    fetchImpl: async (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
        // Unref'd so the leftover timer cannot hold the test process open.
        setTimeout(() => resolve(jsonResponse(ML_SUCCESS_BODY)), 5_000).unref()
      }),
  })
  await assert.rejects(ml.predict(DECISION_ROW), { code: 'ML_TIMEOUT' })
})

test('malformed bodies and out-of-range probabilities are ML_BAD_RESPONSE', async () => {
  const cases = [
    () => new Response('not json', { status: 200 }),
    () => jsonResponse({ ...ML_SUCCESS_BODY, probability_of_reversal: 1.5 }),
    () => jsonResponse({ ...ML_SUCCESS_BODY, disclaimer: '' }),
    () => jsonResponse({ ...ML_SUCCESS_BODY, predicted_class: 2 }),
    () => jsonResponse([1, 2, 3]),
  ]
  for (const makeResponse of cases) {
    const ml = new MlClient({ baseUrl: 'http://ml.test', fetchImpl: async () => makeResponse() })
    await assert.rejects(ml.predict(DECISION_ROW), { code: 'ML_BAD_RESPONSE' })
  }
})

test('validateMlResponse accepts the documented contract only', () => {
  assert.deepEqual(validateMlResponse(ML_SUCCESS_BODY), ML_SUCCESS_BODY)
  assert.throws(() => validateMlResponse(null), { code: 'ML_BAD_RESPONSE' })
  assert.throws(() => validateMlResponse({}), { code: 'ML_BAD_RESPONSE' })
})
