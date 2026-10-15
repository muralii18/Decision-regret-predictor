/**
 * Client for the FastAPI ML service (ml/prediction/main.py).
 *
 * Contract (see ml/README.md "Prediction API"):
 *  - request: exactly the seven decision-time features — never ids, dates,
 *    observation windows or target labels;
 *  - response: probability_of_reversal (0-1), probability_percent,
 *    predicted_class, predicted_label, threshold, dataset, disclaimer.
 *
 * Failures raise MlServiceError with a machine code and a safe, client-ready
 * message. Raw upstream bodies, stack traces and URLs never reach clients.
 */

export const ML_FEATURE_FIELDS = [
  'category',
  'estimated_cost_usd',
  'num_alternatives',
  'confidence_level',
  'business_context',
  'expected_benefits',
  'identified_risks',
]

export class MlServiceError extends Error {
  constructor(code, publicMessage, options = {}) {
    super(publicMessage, options)
    this.name = 'MlServiceError'
    this.code = code
    this.publicMessage = publicMessage
  }
}

const SAFE_MESSAGES = {
  ML_TIMEOUT: 'The ML service did not respond in time. No prediction was saved.',
  ML_UNAVAILABLE: 'The ML service is unavailable. No prediction was saved.',
  ML_REJECTED: 'The ML service rejected the prediction request. No prediction was saved.',
  ML_BAD_RESPONSE: 'The ML service returned an invalid response. No prediction was saved.',
}

/**
 * Map a decision row to the exact seven-feature ML payload. This whitelist
 * is the only path from stored data to the model — ids, dates, observation
 * windows and outcome labels cannot leak through it.
 */
export function toMlFeatures(decision) {
  const payload = {}
  for (const field of ML_FEATURE_FIELDS) {
    payload[field] = decision[field]
  }
  return payload
}

function requireFiniteInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/** Validate a successful /predict body; throws ML_BAD_RESPONSE otherwise. */
export function validateMlResponse(body) {
  const bad = () => {
    throw new MlServiceError('ML_BAD_RESPONSE', SAFE_MESSAGES.ML_BAD_RESPONSE)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) bad()
  if (!requireFiniteInRange(body.probability_of_reversal, 0, 1)) bad()
  if (!requireFiniteInRange(body.probability_percent, 0, 100)) bad()
  if (body.predicted_class !== 0 && body.predicted_class !== 1) bad()
  if (typeof body.predicted_label !== 'string' || body.predicted_label.length === 0) bad()
  if (typeof body.threshold !== 'number' || !Number.isFinite(body.threshold)) bad()
  if (typeof body.dataset !== 'string' || body.dataset.length === 0) bad()
  if (typeof body.disclaimer !== 'string' || body.disclaimer.length === 0) bad()
  return {
    probability_of_reversal: body.probability_of_reversal,
    probability_percent: body.probability_percent,
    predicted_class: body.predicted_class,
    predicted_label: body.predicted_label,
    threshold: body.threshold,
    dataset: body.dataset,
    disclaimer: body.disclaimer,
  }
}

export class MlClient {
  constructor({ baseUrl, timeoutMs = 5000, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
  }

  /**
   * GET /health — liveness probe used by the backend's `GET /health?ml=1`
   * endpoint. Never throws: returns a small status object so health checks
   * stay fast and cannot fail on a down service.
   *
   * @returns {Promise<{ status: 'ok' | 'no_model' | 'unhealthy' | 'unreachable',
   *                     modelLoaded: boolean }>}
   */
  async probeHealth() {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        // Health probes must be quick; cap below the predict timeout.
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 1500)),
      })
      if (!response.ok) {
        return { status: 'unhealthy', modelLoaded: false }
      }
      const body = await response.json()
      if (body && body.model_loaded === true) {
        return { status: 'ok', modelLoaded: true }
      }
      // The service answered but reports no loadable trained artifact —
      // /predict would return 503, so the model is NOT available.
      return { status: 'no_model', modelLoaded: false }
    } catch {
      return { status: 'unreachable', modelLoaded: false }
    }
  }

  /** POST /predict with the seven features; returns the validated response. */
  async predict(decision) {
    const url = `${this.baseUrl}/predict`
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toMlFeatures(decision)),
      signal: AbortSignal.timeout(this.timeoutMs),
    }

    let response
    try {
      response = await this.fetchImpl(url, init)
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new MlServiceError('ML_TIMEOUT', SAFE_MESSAGES.ML_TIMEOUT, { cause: error })
      }
      throw new MlServiceError('ML_UNAVAILABLE', SAFE_MESSAGES.ML_UNAVAILABLE, { cause: error })
    }

    if (!response.ok) {
      // FastAPI's own 503 detail is client-safe by design (see
      // ml/prediction/main.py) and is the only upstream text we reuse.
      let detail = ''
      try {
        const body = await response.json()
        if (typeof body?.detail === 'string' && body.detail.length <= 500) {
          detail = body.detail
        }
      } catch {
        /* ignore malformed error bodies */
      }
      if (response.status === 503) {
        throw new MlServiceError(
          'ML_UNAVAILABLE',
          detail ? `The ML service has no usable model: ${detail}` : SAFE_MESSAGES.ML_UNAVAILABLE,
        )
      }
      if (response.status === 422) {
        throw new MlServiceError('ML_REJECTED', SAFE_MESSAGES.ML_REJECTED)
      }
      throw new MlServiceError('ML_UNAVAILABLE', SAFE_MESSAGES.ML_UNAVAILABLE)
    }

    let body
    try {
      body = await response.json()
    } catch (error) {
      throw new MlServiceError('ML_BAD_RESPONSE', SAFE_MESSAGES.ML_BAD_RESPONSE, { cause: error })
    }
    return validateMlResponse(body)
  }
}
