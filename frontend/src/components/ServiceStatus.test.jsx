import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { installFetchMock } from '../test/mockFetch'
import ServiceStatus from './ServiceStatus'

afterEach(() => {
  vi.unstubAllGlobals()
})

const HEALTHY = {
  status: 'ok',
  service: 'decision-regret-predictor-backend',
  database: 'ok',
  ml_service: 'ok',
  ml_probed: true,
  ml_model_loaded: true,
  time: '2026-10-15T00:00:00.000Z',
}

const NOT_READY = /the model is ready/

describe('landing service status (GET /health?ml=1)', () => {
  test('claims the model is ready only when the probe confirmed it', async () => {
    installFetchMock([{ method: 'GET', path: '/health', body: HEALTHY }])
    render(<ServiceStatus />)

    expect(await screen.findByText('All services online — the model is ready')).toBeTruthy()
    expect(screen.getByText(/answered their health checks/)).toBeTruthy()
  })

  test('probes /health?ml=1 on mount and rechecks on demand', async () => {
    const mock = installFetchMock([{ method: 'GET', path: '/health', body: HEALTHY }])
    render(<ServiceStatus />)
    await screen.findByText('All services online — the model is ready')

    expect(mock.calls[0].url).toContain('/health?ml=1')

    fireEvent.click(screen.getByRole('button', { name: 'Recheck' }))
    await waitFor(() => expect(mock.calls).toHaveLength(2))
    expect(mock.calls[1].url).toContain('/health?ml=1')
  })

  test('shows an honest offline state when the backend is unreachable', async () => {
    installFetchMock([{ method: 'GET', path: '/health', networkError: true }])
    render(<ServiceStatus />)

    expect(await screen.findByText('Services offline — the backend is not responding')).toBeTruthy()
    expect(screen.getByText(/Cannot reach the API server/)).toBeTruthy()
    expect(screen.queryByText(NOT_READY)).toBeNull()
    // The old static label no longer exists anywhere:
    expect(screen.queryByText('Model not yet connected')).toBeNull()
  })

  test('reports the ML service down while the backend is online', async () => {
    installFetchMock([
      { method: 'GET', path: '/health', body: { ...HEALTHY, ml_service: 'unreachable', ml_model_loaded: false } },
    ])
    render(<ServiceStatus />)

    expect(await screen.findByText('Backend online — ML service unreachable')).toBeTruthy()
    expect(screen.getByText(/prediction requests fail until the ML service is started/)).toBeTruthy()
    expect(screen.queryByText(NOT_READY)).toBeNull()
  })

  test('reports a reachable ML service with no trained model', async () => {
    installFetchMock([
      { method: 'GET', path: '/health', body: { ...HEALTHY, ml_service: 'no_model', ml_model_loaded: false } },
    ])
    render(<ServiceStatus />)

    expect(await screen.findByText('ML service reachable — no trained model')).toBeTruthy()
    expect(screen.getByText(/predictions return 503 until the model is trained/)).toBeTruthy()
    expect(screen.queryByText(NOT_READY)).toBeNull()
  })

  test('reports an unavailable database before anything else', async () => {
    installFetchMock([
      { method: 'GET', path: '/health', body: { ...HEALTHY, status: 'degraded', database: 'unavailable' } },
    ])
    render(<ServiceStatus />)

    expect(await screen.findByText('Backend reachable — PostgreSQL unavailable')).toBeTruthy()
    expect(screen.queryByText(NOT_READY)).toBeNull()
  })

  test('never shows a ready state for an unrecognized response', async () => {
    installFetchMock([{ method: 'GET', path: '/health', body: { nonsense: true } }])
    render(<ServiceStatus />)

    expect(await screen.findByText('Status unavailable')).toBeTruthy()
    expect(screen.queryByText(NOT_READY)).toBeNull()
  })
})
