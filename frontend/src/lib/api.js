// ---------------------------------------------------------------------------
// Reusable API client for the Express backend (../backend, see
// backend/README.md for the full contract).
//
//  - Base URL: import.meta.env.VITE_API_BASE_URL, falling back to the
//    documented local-development default http://localhost:3001.
//    An explicitly empty value means "same origin" (dev-server proxy).
//  - Every failure throws an ApiError carrying the server's safe `message`
//    plus optional per-field `details`, so views can show understandable
//    errors. Network/timeout failures get friendly messages too.
//  - Nothing here fabricates data: callers always receive exactly what the
//    server returned, or an exception.
// ---------------------------------------------------------------------------

export const DEFAULT_API_BASE_URL = 'http://localhost:3001'

const REQUEST_TIMEOUT_MS = 15_000

/** Resolve the API base URL (read lazily so env changes are picked up). */
export function getBaseUrl() {
  const raw = import.meta.env?.VITE_API_BASE_URL
  if (raw === undefined || raw === null) return DEFAULT_API_BASE_URL
  return String(raw).trim().replace(/\/+$/, '')
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Positive-integer id guard — ids come back from the API as strings. */
function requireId(id) {
  if (typeof id === 'string' || typeof id === 'number') {
    if (/^\d{1,18}$/.test(String(id))) return String(id)
  }
  throw new ApiError('Invalid decision id.', { code: 'invalid_id' })
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const base = getBaseUrl()
  const init = {
    method,
    headers: { accept: 'application/json' },
    signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(`${base}${path}`, init)
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ApiError('The request timed out before the server answered. Please try again.', {
        code: 'timeout',
      })
    }
    const target = base || 'this page (same origin)'
    throw new ApiError(
      `Cannot reach the API server at ${target}. Make sure PostgreSQL, the ML service and the Express backend are running (see README), then try again.`,
      { code: 'network_error' },
    )
  }

  const text = await response.text().catch(() => '')
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    // Backend error shape: { error, message, details?: [{ field, message }] }.
    const message =
      payload && typeof payload.message === 'string' && payload.message.trim() !== ''
        ? payload.message
        : `The request failed with status ${response.status}. Please try again.`
    const details = Array.isArray(payload?.details) ? payload.details : null
    const code = typeof payload?.error === 'string' ? payload.error : 'http_error'
    throw new ApiError(message, { status: response.status, code, details })
  }

  return payload
}

/**
 * Map New Decision form values to the backend's create-decision payload
 * (backend DECISION_FIELDS: title, category, estimated_cost_usd,
 * num_alternatives, confidence_level, business_context, expected_benefits,
 * identified_risks). `decision_date` is intentionally omitted — the backend
 * defaults it to today.
 */
export function toDecisionPayload(values) {
  return {
    title: values.title.trim(),
    category: values.category,
    estimated_cost_usd: Number(values.cost),
    num_alternatives: Number(values.alternatives),
    confidence_level: values.confidence,
    business_context: values.description.trim(),
    expected_benefits: values.benefits.trim(),
    identified_risks: values.risks.trim(),
  }
}

/** POST /api/decisions — create a decision; returns the saved row (with id). */
export function createDecision(fields) {
  return request('/api/decisions', { method: 'POST', body: fields })
}

/**
 * GET /api/decisions?limit=&offset= — newest first.
 * Returns { data, pagination: { limit, offset, total } } (server pagination).
 */
export async function listDecisions({ limit = 20, offset = 0 } = {}) {
  const payload = await request(`/api/decisions?limit=${limit}&offset=${offset}`)
  if (!payload || !Array.isArray(payload.data)) {
    throw new ApiError('The server returned an unexpected response for the decision list.', {
      code: 'bad_response',
    })
  }
  const pagination = payload.pagination ?? {}
  return {
    data: payload.data,
    pagination: {
      limit: Number.isInteger(pagination.limit) ? pagination.limit : limit,
      offset: Number.isInteger(pagination.offset) ? pagination.offset : offset,
      total: Number.isInteger(pagination.total) ? pagination.total : payload.data.length,
    },
  }
}

/** GET /api/decisions/:id — decision + outcome + predictions. */
export async function getDecision(id) {
  return request(`/api/decisions/${requireId(id)}`)
}

/** POST /api/decisions/:id/predictions — ask the backend for a genuine prediction. */
export async function createPrediction(id) {
  return request(`/api/decisions/${requireId(id)}/predictions`, { method: 'POST' })
}

/** GET /api/decisions/:id/predictions — saved predictions, newest first. */
export async function listPredictions(id) {
  const payload = await request(`/api/decisions/${requireId(id)}/predictions`)
  if (!payload || !Array.isArray(payload.data)) {
    throw new ApiError('The server returned an unexpected response for the prediction list.', {
      code: 'bad_response',
    })
  }
  return payload.data
}

/**
 * POST /api/decisions/:id/outcomes — record or update the actual outcome.
 *
 * `unknown` is first-class: no outcome_date is ever sent for it (the backend
 * forbids a date on unknown outcomes, and unknown is never coerced to
 * not_reversed anywhere in this client).
 */
export async function recordOutcome(id, { outcome, outcomeDate = null, note = null } = {}) {
  const body = { outcome }
  if (outcome !== 'unknown' && outcomeDate) body.outcome_date = outcomeDate
  if (note) body.note = note
  return request(`/api/decisions/${requireId(id)}/outcomes`, { method: 'POST', body })
}

/**
 * GET /health — backend health ({ status, database, ml_service, ... }).
 *
 * With `probeMl: true` the request is `GET /health?ml=1`, which makes the
 * backend perform a real probe of the ML service instead of only reporting
 * its configuration. That is what lets the UI say the model is available
 * (or not) accurately instead of assuming it.
 */
export function getHealth({ probeMl = false } = {}) {
  return request(`/health${probeMl ? '?ml=1' : ''}`)
}
