import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { installFetchMock } from '../test/mockFetch'
import NewDecisionForm from './NewDecisionForm'

const DECISION_ROW = {
  id: '17',
  title: 'Approve Q4 supplier contract renewal',
  decision_date: '2026-10-15',
  category: 'Supplier Selection',
  estimated_cost_usd: 250000,
  num_alternatives: 4,
  confidence_level: 'Medium',
  business_context: 'We are selecting a new logistics vendor before the renewal deadline.',
  expected_benefits: 'Lower per-unit shipping cost and faster delivery times.',
  identified_risks: 'Migration effort and a single-provider dependency.',
  created_at: '2026-10-15T02:00:00.000Z',
  updated_at: '2026-10-15T02:00:00.000Z',
}

const PREDICTION = {
  id: '3',
  decision_id: '17',
  probability_of_reversal: 0.42,
  probability_percent: 42,
  predicted_class: 0,
  predicted_label: 'Not reversed',
  threshold: 0.5,
  dataset: 'synthetic',
  disclaimer:
    'Experimental prototype: the model was trained on a small synthetic dataset (39 labelled rows).',
}

function fillForm() {
  fireEvent.change(screen.getByLabelText(/Decision title/), {
    target: { value: 'Approve Q4 supplier contract renewal' },
  })
  fireEvent.change(screen.getByLabelText(/Decision category/), {
    target: { value: 'Supplier Selection' },
  })
  fireEvent.change(screen.getByLabelText(/Estimated financial cost/), {
    target: { value: '250000' },
  })
  fireEvent.change(screen.getByLabelText(/Number of alternatives/), {
    target: { value: '4' },
  })
  fireEvent.click(screen.getByLabelText('Medium'))
  fireEvent.change(screen.getByLabelText(/Description and business context/), {
    target: { value: 'We are selecting a new logistics vendor before the renewal deadline.' },
  })
  fireEvent.change(screen.getByLabelText(/Expected benefits/), {
    target: { value: 'Lower per-unit shipping cost and faster delivery times.' },
  })
  fireEvent.change(screen.getByLabelText(/Main risks identified/), {
    target: { value: 'Migration effort and a single-provider dependency.' },
  })
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('successful workflow', () => {
  test('creates the decision, then requests a prediction and hands both to the results view', async () => {
    const mock = installFetchMock([
      { method: 'POST', path: '/api/decisions', status: 201, body: DECISION_ROW },
      {
        method: 'POST',
        path: '/api/decisions/17/predictions',
        status: 201,
        body: PREDICTION,
      },
    ])
    const onPredictionReady = vi.fn()
    render(<NewDecisionForm onCancel={vi.fn()} onViewHistory={vi.fn()} onPredictionReady={onPredictionReady} />)

    fillForm()
    submit()

    await waitFor(() => expect(onPredictionReady).toHaveBeenCalledTimes(1))
    const [decision, prediction] = onPredictionReady.mock.calls[0]
    expect(decision.id).toBe('17')
    expect(prediction.predicted_label).toBe('Not reversed')
    expect(prediction.disclaimer).toContain('Experimental prototype')

    // Exactly two requests: create, then predict with the returned id.
    expect(mock.calls).toHaveLength(2)
    expect(mock.calls[0].pathname).toBe('/api/decisions')
    expect(mock.calls[1].pathname).toBe('/api/decisions/17/predictions')

    // The create payload contains only accepted backend fields.
    expect(Object.keys(mock.calls[0].body).sort()).toEqual([
      'business_context',
      'category',
      'confidence_level',
      'estimated_cost_usd',
      'expected_benefits',
      'identified_risks',
      'num_alternatives',
      'title',
    ])
    expect(mock.calls[0].body.target_reversed).toBeUndefined()
    expect(mock.calls[1].body).toBeNull()
  })
})

describe('validation', () => {
  test('an empty submit shows field errors and makes no request', async () => {
    const mock = installFetchMock([])
    render(<NewDecisionForm onCancel={vi.fn()} onViewHistory={vi.fn()} onPredictionReady={vi.fn()} />)

    submit()

    expect(await screen.findByText('Decision title is required.')).toBeTruthy()
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    expect(mock.calls).toHaveLength(0)
  })

  test('client validation rejects a zero cost (the ML schema requires > 0)', async () => {
    const mock = installFetchMock([])
    render(<NewDecisionForm onCancel={vi.fn()} onViewHistory={vi.fn()} onPredictionReady={vi.fn()} />)

    fillForm()
    fireEvent.change(screen.getByLabelText(/Estimated financial cost/), { target: { value: '0' } })
    submit()

    expect(await screen.findByText('Enter a cost greater than 0.')).toBeTruthy()
    expect(mock.calls).toHaveLength(0)
  })
})

describe('backend field errors', () => {
  test("server-side validation details are mapped onto the form fields", async () => {
    installFetchMock([
      {
        method: 'POST',
        path: '/api/decisions',
        status: 400,
        body: {
          error: 'validation_failed',
          message: 'The decision payload is invalid.',
          details: [
            {
              field: 'business_context',
              message: 'business_context must be at least 10 characters.',
            },
          ],
        },
      },
    ])
    render(<NewDecisionForm onCancel={vi.fn()} onViewHistory={vi.fn()} onPredictionReady={vi.fn()} />)

    fillForm()
    submit()

    expect(await screen.findByText('business_context must be at least 10 characters.')).toBeTruthy()
  })
})

describe('unavailable backend', () => {
  test('shows a useful error, keeps the entered data, and fabricates nothing', async () => {
    installFetchMock([
      { method: 'POST', path: '/api/decisions', networkError: true },
    ])
    const onPredictionReady = vi.fn()
    render(<NewDecisionForm onCancel={vi.fn()} onViewHistory={vi.fn()} onPredictionReady={onPredictionReady} />)

    fillForm()
    submit()

    expect(await screen.findByText(/Cannot reach the API server/)).toBeTruthy()
    expect(onPredictionReady).not.toHaveBeenCalled()
    // Entered data is preserved for a retry.
    expect(screen.getByLabelText(/Decision title/).value).toBe(
      'Approve Q4 supplier contract renewal',
    )
    expect(screen.queryByText(/%$/)).toBeNull()
  })
})

describe('decision saved but prediction unavailable', () => {
  const failingPrediction = () =>
    installFetchMock([
      { method: 'POST', path: '/api/decisions', status: 201, body: DECISION_ROW },
      {
        method: 'POST',
        path: '/api/decisions/17/predictions',
        status: 503,
        body: {
          error: 'ml_unavailable',
          message: 'The ML service is unavailable. No prediction was saved.',
        },
      },
    ])

  test('keeps the saved decision, explains the failure, and never creates a duplicate', async () => {
    const mock = failingPrediction()
    const onPredictionReady = vi.fn()
    render(<NewDecisionForm onCancel={vi.fn()} onViewHistory={vi.fn()} onPredictionReady={onPredictionReady} />)

    fillForm()
    submit()

    expect(await screen.findByText(/Decision saved — prediction unavailable/)).toBeTruthy()
    expect(
      screen.getByText(/The ML service is unavailable. No prediction was saved./),
    ).toBeTruthy()
    expect(screen.getByText('17', { selector: 'strong' })).toBeTruthy() // saved decision id

    // Exactly one create request — no automatic duplicate decision.
    expect(calls(mock.calls, '/api/decisions')).toHaveLength(1)
    expect(onPredictionReady).not.toHaveBeenCalled()
    // No fabricated probability anywhere.
    expect(screen.queryByText(/42(\.0)?%/)).toBeNull()
    expect(screen.queryByText('Not reversed')).toBeNull()
  })

  test('retrying reuses the saved decision and succeeds on the second attempt', async () => {
    const mock = installFetchMock([
      { method: 'POST', path: '/api/decisions', status: 201, body: DECISION_ROW },
      {
        method: 'POST',
        path: '/api/decisions/17/predictions',
        status: (call) => (call.attempt === 1 ? 503 : 201),
        body: (call) =>
          call.attempt === 1
            ? { error: 'ml_unavailable', message: 'The ML service is unavailable.' }
            : PREDICTION,
      },
    ])
    const onPredictionReady = vi.fn()
    render(<NewDecisionForm onCancel={vi.fn()} onViewHistory={vi.fn()} onPredictionReady={onPredictionReady} />)

    fillForm()
    submit()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry prediction' }))

    await waitFor(() => expect(onPredictionReady).toHaveBeenCalledTimes(1))
    expect(onPredictionReady.mock.calls[0][1].probability_percent).toBe(42)
    expect(calls(mock.calls, '/api/decisions')).toHaveLength(1)
    expect(calls(mock.calls, '/api/decisions/17/predictions')).toHaveLength(2)
  })
})

describe('duplicate submission guard', () => {
  test('clicking submit twice while in flight sends only one create request', async () => {
    const mock = installFetchMock([
      { method: 'POST', path: '/api/decisions', status: 201, body: DECISION_ROW, delayMs: 40 },
      { method: 'POST', path: '/api/decisions/17/predictions', status: 201, body: PREDICTION },
    ])
    const onPredictionReady = vi.fn()
    render(<NewDecisionForm onCancel={vi.fn()} onViewHistory={vi.fn()} onPredictionReady={onPredictionReady} />)

    fillForm()
    submit()
    // A second submission attempt while the first is still in flight (a raw
    // form submit, which bypasses the disabled button and hits the guard).
    fireEvent.submit(document.querySelector('form'))

    await waitFor(() => expect(onPredictionReady).toHaveBeenCalledTimes(1))
    expect(calls(mock.calls, '/api/decisions')).toHaveLength(1)
  })
})

function calls(all, pathname) {
  return all.filter((call) => call.pathname === pathname && call.method === 'POST')
}
