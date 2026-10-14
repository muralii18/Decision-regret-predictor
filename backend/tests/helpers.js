/** Shared test helpers: an in-memory repo double, a fake FastAPI-like ML
 * HTTP server (real socket, records requests), and an app-server helper. */
import http from 'node:http'

export const VALID_DECISION = {
  title: 'Approve Q4 supplier contract renewal',
  category: 'Supplier Selection',
  estimated_cost_usd: 250_000,
  num_alternatives: 4,
  confidence_level: 'Medium',
  business_context: 'Selected a new logistics vendor ahead of a contract renewal deadline.',
  expected_benefits: 'Lower per-unit shipping cost and faster delivery times.',
  identified_risks: 'Migration effort and single-provider dependency.',
}

export const ML_SUCCESS_BODY = {
  probability_of_reversal: 0.42,
  probability_percent: 42.0,
  predicted_class: 0,
  predicted_label: 'Not reversed',
  threshold: 0.5,
  dataset: 'synthetic',
  disclaimer:
    'Experimental prototype: the model was trained on a small synthetic dataset (39 labelled rows).',
}

/** In-memory repository with the same interface and shapes as src/db/repo.js. */
export function createFakeRepo() {
  let nextId = 1
  const decisions = new Map()
  const outcomes = new Map()
  const predictions = new Map()
  let failing = false

  const now = () => new Date().toISOString()

  return {
    decisions,
    outcomes,
    predictions,
    setFailing(value) {
      failing = value
    },
    async healthCheck() {
      if (failing) throw new Error('connection refused')
    },
    async createDecision(row) {
      const id = String(nextId++)
      const record = { id, ...row, created_at: now(), updated_at: now() }
      decisions.set(id, record)
      return record
    },
    async getDecision(id) {
      return decisions.get(String(id)) ?? null
    },
    async listDecisions({ limit, offset }) {
      const sorted = [...decisions.values()].sort((a, b) =>
        b.created_at.localeCompare(a.created_at) || Number(b.id) - Number(a.id),
      )
      const rows = sorted.slice(offset, offset + limit).map((decision) => {
        const outcome = outcomes.get(decision.id)
        return {
          ...decision,
          outcome_value: outcome?.outcome ?? null,
          outcome_date_value: outcome?.outcome_date ?? null,
          outcome_note: outcome?.note ?? null,
          outcome_updated_at: outcome?.updated_at ?? null,
        }
      })
      return { rows, totalCount: decisions.size }
    },
    async getOutcome(decisionId) {
      return outcomes.get(String(decisionId)) ?? null
    },
    async upsertOutcome(decisionId, value) {
      const existing = outcomes.get(String(decisionId))
      const record = {
        id: existing?.id ?? String(outcomes.size + 1),
        decision_id: String(decisionId),
        ...value,
        created_at: existing?.created_at ?? now(),
        updated_at: now(),
      }
      outcomes.set(String(decisionId), record)
      return record
    },
    async insertPrediction(decisionId, prediction) {
      const record = {
        id: String(predictions.size + 1),
        decision_id: String(decisionId),
        probability_of_reversal: prediction.probability_of_reversal,
        probability_percent: prediction.probability_percent,
        predicted_class: prediction.predicted_class,
        predicted_label: prediction.predicted_label,
        threshold: prediction.threshold,
        dataset: prediction.dataset,
        disclaimer: prediction.disclaimer,
        provider_response: prediction.provider_response,
        created_at: now(),
      }
      predictions.set(record.id, record)
      return record
    },
    async listPredictions(decisionId) {
      return [...predictions.values()]
        .filter((row) => row.decision_id === String(decisionId))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
  }
}

/**
 * A real HTTP server that mimics the FastAPI /predict contract and records
 * every request it receives.
 *
 * handler({ url, body }) -> { status?, body } | { delayMs, ... }
 */
export async function startFakeMlServer(handler) {
  const requests = []
  const server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : null
    requests.push({ url: req.url, body })
    const result = await handler({ url: req.url, body })
    if (result.delayMs) await new Promise((resolve) => setTimeout(resolve, result.delayMs))
    res.writeHead(result.status ?? 200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(result.body))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve)
        // Fetch keeps connections alive; drop them so close() cannot hang.
        server.closeAllConnections?.()
      }),
  }
}

/** A TCP port that nothing listens on (for real ECONNREFUSED tests). */
export async function closedPort() {
  const server = http.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

/** Listen on an ephemeral port and run fn(baseUrl); always closes. */
export async function withAppServer(app, fn) {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(baseUrl)
  } finally {
    await new Promise((resolve) => {
      server.close(resolve)
      // Fetch keeps connections alive; drop them so close() cannot hang.
      server.closeAllConnections?.()
    })
  }
}

export function testConfig(overrides = {}) {
  return {
    nodeEnv: 'test',
    port: 0,
    databaseUrl: '',
    mlServiceUrl: 'http://127.0.0.1:1',
    mlTimeoutMs: 1000,
    poolMax: 2,
    corsOrigins: ['http://localhost:5173'],
    ...overrides,
  }
}
