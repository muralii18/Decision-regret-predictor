import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { installFetchMock } from './test/mockFetch'

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
  outcome: null,
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
  created_at: '2026-10-15T02:00:01.000Z',
}

const HISTORY_TWO = {
  data: [
    DECISION_ROW,
    {
      ...DECISION_ROW,
      id: '16',
      title: 'Renew packaging contract with the incumbent supplier',
      decision_date: '2026-10-01',
      outcome: {
        outcome: 'reversed',
        outcome_date: '2026-10-10',
        note: 'Supplier missed delivery deadlines',
        updated_at: '2026-10-11T09:00:00.000Z',
      },
    },
  ],
  pagination: { limit: 20, offset: 0, total: 2 },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Prediction Results view', () => {
  test('shows an honest empty state with no fabricated values', () => {
    installFetchMock([])
    render(<App initialView="results" />)

    expect(screen.getByText('No prediction results yet')).toBeTruthy()
    expect(screen.getAllByText('Not available yet').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Risk classification/)).toBeNull()
    expect(screen.queryByText(/\d+(\.\d+)?%/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Go to New Prediction' })).toBeTruthy()
  })
})

describe('full workflow: form → prediction → results → history', () => {
  test('a submitted decision ends up shown from real backend responses', async () => {
    const mock = installFetchMock([
      { method: 'POST', path: '/api/decisions', status: 201, body: DECISION_ROW },
      { method: 'POST', path: '/api/decisions/17/predictions', status: 201, body: PREDICTION },
      { method: 'GET', path: '/api/decisions', status: 200, body: HISTORY_TWO },
    ])
    render(<App initialView="new-prediction" />)

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
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    // 6. React displays the returned result and disclaimer.
    expect(await screen.findByText('42.0%')).toBeTruthy()
    expect(screen.getByText('Not reversed')).toBeTruthy()
    expect(screen.getByText(PREDICTION.disclaimer)).toBeTruthy()
    expect(screen.getByText('Approve Q4 supplier contract renewal')).toBeTruthy()
    expect(screen.getByText(/Dataset: synthetic/)).toBeTruthy()

    // 7. Decision History loads the saved decision.
    const historyButtons = screen.getAllByRole('button', { name: 'Decision History' })
    fireEvent.click(historyButtons[0]) // sidebar navigation
    expect(await screen.findByText('Renew packaging contract with the incumbent supplier')).toBeTruthy()
    expect(screen.getByText(/Showing 1–2 of 2 saved decisions/)).toBeTruthy()
    expect(screen.getByText('Reversed')).toBeTruthy() // recorded outcome is shown

    expect(mock.calls.filter((call) => call.method === 'POST' && call.pathname === '/api/decisions')).toHaveLength(1)
    expect(mock.calls[1].pathname).toBe('/api/decisions/17/predictions')
  })
})

describe('Decision History', () => {
  test('records an unknown outcome without an outcome_date', async () => {
    const mock = installFetchMock([
      { method: 'GET', path: '/api/decisions', status: 200, body: HISTORY_TWO },
      {
        method: 'POST',
        path: '/api/decisions/17/outcomes',
        status: 200,
        body: {
          id: '5',
          decision_id: '17',
          outcome: 'unknown',
          outcome_date: null,
          note: null,
          created_at: '2026-10-15T03:00:00.000Z',
          updated_at: '2026-10-15T03:00:00.000Z',
        },
      },
    ])
    render(<App initialView="history" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Record outcome' }))
    fireEvent.change(screen.getByLabelText(/Actual outcome/), { target: { value: 'unknown' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // 8. Unknown persists as unknown — never as not_reversed, never dated.
    expect(await screen.findByText('Unknown (still open)')).toBeTruthy()
    const outcomeCalls = mock.calls.filter(
      (call) => call.method === 'POST' && call.pathname === '/api/decisions/17/outcomes',
    )
    expect(outcomeCalls).toHaveLength(1)
    expect(outcomeCalls[0].body).toEqual({ outcome: 'unknown' })
    expect(outcomeCalls[0].body.outcome).not.toBe('not_reversed')
  })

  test('shows a useful error and no demo rows when the backend is unreachable', async () => {
    installFetchMock([{ method: 'GET', path: '/api/decisions', networkError: true }])
    render(<App initialView="history" />)

    expect(await screen.findByText('Decision history is unavailable')).toBeTruthy()
    expect(screen.getByText(/Cannot reach the API server/)).toBeTruthy()
    // Never silently reverting to demo data:
    expect(screen.queryByText(/Award regional freight contract/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  test('shows an empty state when nothing is saved yet', async () => {
    installFetchMock([
      {
        method: 'GET',
        path: '/api/decisions',
        status: 200,
        body: { data: [], pagination: { limit: 20, offset: 0, total: 0 } },
      },
    ])
    render(<App initialView="history" />)

    expect(await screen.findByText('No decisions saved yet')).toBeTruthy()
    expect(screen.queryByText(/Showing 1–/)).toBeNull()
  })

  test('paginates with the server response', async () => {
    const mock = installFetchMock([
      {
        method: 'GET',
        path: '/api/decisions',
        status: 200,
        body: (call) => ({
          data: [DECISION_ROW],
          pagination: {
            limit: 20,
            offset: call.url.includes('offset=20') ? 20 : 0,
            total: 45,
          },
        }),
      },
    ])
    render(<App initialView="history" />)

    expect(await screen.findByText(/Showing 1–1 of 45 saved decisions/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/Showing 21–21 of 45 saved decisions/)).toBeTruthy()
    expect(mock.calls.some((call) => call.url.includes('offset=20'))).toBe(true)
  })
})

describe('Dashboard', () => {
  test('shows live counts and recent decisions from the backend', async () => {
    installFetchMock([
      {
        method: 'GET',
        path: '/api/decisions',
        status: 200,
        body: HISTORY_TWO,
      },
    ])
    render(<App initialView="dashboard" />)

    expect(await screen.findByText('Approve Q4 supplier contract renewal')).toBeTruthy()
    // Live cards with an explicit source chip.
    expect(screen.getAllByText('Live').length).toBe(4)
    expect(screen.getByText('Saved in PostgreSQL (live)')).toBeTruthy()
    expect(screen.getByText('Live data')).toBeTruthy() // table tag
    // Demo records are not presented as real data.
    expect(screen.queryByText(/Award regional freight contract/)).toBeNull()
    // 2 saved, 1 with an outcome (reversed), 1 awaiting.
    expect(
      screen.getByText('Total Decisions').closest('.summary-card').querySelector('.summary-card__value')
        .textContent,
    ).toBe('2')
    expect(
      screen
        .getByText('Reversed Decisions')
        .closest('.summary-card')
        .querySelector('.summary-card__value').textContent,
    ).toBe('1')
  })

  test('reports an API error instead of falling back to demo results', async () => {
    installFetchMock([{ method: 'GET', path: '/api/decisions', networkError: true }])
    render(<App initialView="dashboard" />)

    expect(await screen.findByText('Dashboard data is unavailable')).toBeTruthy()
    expect(screen.queryByText(/Award regional freight contract/)).toBeNull()
    expect(screen.queryByText('Demo data')).toBeNull()
  })
})

describe('navigation and placeholders', () => {
  test('landing page and the placeholder auth screens still work', async () => {
    installFetchMock([
      {
        method: 'GET',
        path: '/health',
        status: 200,
        body: {
          status: 'ok',
          database: 'ok',
          ml_service: 'ok',
          ml_probed: true,
          ml_model_loaded: true,
        },
      },
      {
        method: 'GET',
        path: '/api/decisions',
        status: 200,
        body: { data: [], pagination: { limit: 20, offset: 0, total: 0 } },
      },
    ])
    render(<App />)

    // Live integration status replaces the old "Model not yet connected" label.
    expect(await screen.findByText('All services online — the model is ready')).toBeTruthy()
    expect(screen.queryByText('Model not yet connected')).toBeNull()

    expect(screen.getAllByRole('button', { name: 'Get Started' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Get Started' })[0])
    const enter = await screen.findByRole('button', { name: /Continue to the/ })
    fireEvent.click(enter)
    // Placeholder navigation reaches the (now live) dashboard.
    expect(await screen.findByText('No decisions saved yet')).toBeTruthy()
  })
})
