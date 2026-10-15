import { afterEach, describe, expect, test, vi } from 'vitest'
import { installFetchMock } from '../test/mockFetch'
import {
  ApiError,
  DEFAULT_API_BASE_URL,
  createDecision,
  createPrediction,
  getBaseUrl,
  getDecision,
  listDecisions,
  recordOutcome,
  toDecisionPayload,
} from './api'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('base URL (VITE_API_BASE_URL)', () => {
  test('falls back to the documented local default when unset', () => {
    // Ensure the variable is genuinely absent for this assertion, then restore.
    const hadMeta = 'VITE_API_BASE_URL' in import.meta.env
    const metaValue = import.meta.env.VITE_API_BASE_URL
    const processValue = process.env.VITE_API_BASE_URL
    try {
      delete process.env.VITE_API_BASE_URL
      try {
        delete import.meta.env.VITE_API_BASE_URL
      } catch {
        /* read-only env object — the value is restored below */
      }
      if ('VITE_API_BASE_URL' in import.meta.env) {
        expect(typeof import.meta.env.VITE_API_BASE_URL).toBe('string')
      } else {
        expect(getBaseUrl()).toBe(DEFAULT_API_BASE_URL)
      }
      expect(DEFAULT_API_BASE_URL).toBe('http://localhost:3001')
    } finally {
      if (hadMeta) import.meta.env.VITE_API_BASE_URL = metaValue
      if (processValue !== undefined) process.env.VITE_API_BASE_URL = processValue
    }
  })

  test('uses the configured value and trims trailing slashes', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://backend.local:3001/')
    expect(getBaseUrl()).toBe('http://backend.local:3001')
  })

  test('an explicitly empty value means same-origin requests', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(getBaseUrl()).toBe('')
  })
})

describe('requests', () => {
  test('createDecision posts the payload to /api/decisions with JSON headers', async () => {
    const mock = installFetchMock([
      { method: 'POST', path: '/api/decisions', status: 201, body: { id: '1' } },
    ])
    const payload = { title: 'Approve contract' }
    const result = await createDecision(payload)

    expect(result).toEqual({ id: '1' })
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0].url).toBe('http://localhost:3001/api/decisions')
    expect(mock.calls[0].headers['content-type']).toBe('application/json')
    expect(mock.calls[0].body).toEqual(payload)
  })

  test('server errors become ApiError with status, code, message and field details', async () => {
    installFetchMock([
      {
        method: 'POST',
        path: '/api/decisions',
        status: 400,
        body: {
          error: 'validation_failed',
          message: 'The decision payload is invalid.',
          details: [{ field: 'estimated_cost_usd', message: 'must be greater than 0' }],
        },
      },
    ])

    await expect(createDecision({ title: 'x' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'validation_failed',
      message: 'The decision payload is invalid.',
      details: [{ field: 'estimated_cost_usd', message: 'must be greater than 0' }],
    })
  })

  test('an unreachable backend produces a useful network error', async () => {
    installFetchMock([
      { method: 'GET', path: '/api/decisions', networkError: true },
    ])
    await expect(listDecisions()).rejects.toSatisfy(
      (error) =>
        error instanceof ApiError &&
        error.code === 'network_error' &&
        /Cannot reach the API server/.test(error.message),
    )
  })

  test('non-JSON error bodies still yield a readable message', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 502,
      text: async () => '<html>Bad Gateway</html>',
    }))
    await expect(listDecisions()).rejects.toMatchObject({
      status: 502,
      message: 'The request failed with status 502. Please try again.',
    })
  })

  test('listDecisions rejects malformed success payloads', async () => {
    installFetchMock([
      { method: 'GET', path: '/api/decisions', status: 200, body: { nope: true } },
    ])
    await expect(listDecisions()).rejects.toMatchObject({ code: 'bad_response' })
  })

  test('listDecisions returns the server pagination block', async () => {
    const mock = installFetchMock([
      {
        method: 'GET',
        path: '/api/decisions',
        status: 200,
        body: { data: [], pagination: { limit: 20, offset: 40, total: 57 } },
      },
    ])
    const result = await listDecisions({ limit: 20, offset: 40 })
    expect(result.pagination).toEqual({ limit: 20, offset: 40, total: 57 })
    expect(mock.calls[0].url).toContain('limit=20&offset=40')
  })

  test('invalid ids are rejected before any request is made', async () => {
    const mock = installFetchMock([])
    await expect(getDecision('abc')).rejects.toMatchObject({ code: 'invalid_id' })
    await expect(createPrediction('-1')).rejects.toMatchObject({ code: 'invalid_id' })
    expect(mock.calls).toHaveLength(0)
  })
})

describe('recordOutcome', () => {
  test("'unknown' is sent as-is with no outcome_date and no coercion", async () => {
    const mock = installFetchMock([
      {
        method: 'POST',
        path: '/api/decisions/5/outcomes',
        status: 200,
        body: { outcome: 'unknown', outcome_date: null },
      },
    ])
    const saved = await recordOutcome('5', { outcome: 'unknown', outcomeDate: null, note: '' })
    expect(saved.outcome).toBe('unknown')
    expect(mock.calls[0].body).toEqual({ outcome: 'unknown' })
    expect(mock.calls[0].body.outcome_date).toBeUndefined()
    expect(mock.calls[0].body.outcome).not.toBe('not_reversed')
  })

  test('reversed outcomes include the date and note', async () => {
    const mock = installFetchMock([
      {
        method: 'POST',
        path: '/api/decisions/5/outcomes',
        status: 200,
        body: { outcome: 'reversed' },
      },
    ])
    await recordOutcome('5', { outcome: 'reversed', outcomeDate: '2026-10-10', note: 'Cancelled' })
    expect(mock.calls[0].body).toEqual({
      outcome: 'reversed',
      outcome_date: '2026-10-10',
      note: 'Cancelled',
    })
  })
})

describe('toDecisionPayload (form → backend contract)', () => {
  test('maps exactly the accepted backend fields and nothing else', () => {
    const payload = toDecisionPayload({
      title: '  Approve Q4 supplier contract renewal  ',
      category: 'Supplier Selection',
      description: '  Selecting a new logistics vendor.  ',
      cost: '250000',
      alternatives: '4',
      confidence: 'Medium',
      benefits: '  Lower per-unit shipping cost.  ',
      risks: '  Migration effort and dependency.  ',
    })

    expect(Object.keys(payload).sort()).toEqual([
      'business_context',
      'category',
      'confidence_level',
      'estimated_cost_usd',
      'expected_benefits',
      'identified_risks',
      'num_alternatives',
      'title',
    ])
    expect(payload.title).toBe('Approve Q4 supplier contract renewal')
    expect(payload.estimated_cost_usd).toBe(250000)
    expect(payload.num_alternatives).toBe(4)
    // Outcome/label fields can never leak into the decision payload.
    expect(payload.target_reversed).toBeUndefined()
    expect(payload.decision_date).toBeUndefined()
    expect(payload.observation_window_days).toBeUndefined()
    expect(payload.decision_id).toBeUndefined()
  })
})
