import { useEffect, useState } from 'react'
import { getHealth } from '../lib/api'
import './ServiceStatus.css'

/**
 * Live service status for the landing page.
 *
 * Probes the backend's `GET /health?ml=1`, which checks PostgreSQL and —
 * when asked — the ML service itself, then reports exactly what answered.
 *
 * Honesty rules:
 *  - never claims the model is available: a "ready" message is only shown
 *    when a real probe confirmed the ML service is up with a loaded model;
 *  - services that are down are shown as down (backend unreachable,
 *    database unavailable, ML service down, or no trained artifact);
 *  - nothing is hidden — the check result, its explanation and a manual
 *    recheck are always visible.
 */
function deriveServiceStatus(health) {
  if (!health || typeof health !== 'object' || typeof health.database !== 'string') {
    return {
      tone: 'unknown',
      title: 'Status unavailable',
      detail: 'The backend returned a response this page does not understand.',
    }
  }
  if (health.database !== 'ok') {
    return {
      tone: 'down',
      title: 'Backend reachable — PostgreSQL unavailable',
      detail: 'Decisions cannot be saved until the database is running. See the README for setup.',
    }
  }
  switch (health.ml_service) {
    case 'ok':
      return {
        tone: 'ok',
        title: 'All services online — the model is ready',
        detail:
          'PostgreSQL, the Express backend and the ML service answered their health checks; predictions are produced by the trained model.',
      }
    case 'no_model':
      return {
        tone: 'down',
        title: 'ML service reachable — no trained model',
        detail:
          'The service answers, but its model artifact is missing, so predictions return 503 until the model is trained (see ml/README.md).',
      }
    case 'unreachable':
    case 'unhealthy':
    case 'unavailable':
      return {
        tone: 'down',
        title: 'Backend online — ML service unreachable',
        detail:
          'Decisions can be saved, but prediction requests fail until the ML service is started. See the README for the startup order.',
      }
    case 'not_configured':
      return {
        tone: 'down',
        title: 'Backend online — ML service not configured',
        detail: 'Set ML_SERVICE_URL in backend/.env so the backend can reach the ML service.',
      }
    case 'configured':
      return {
        tone: 'warn',
        title: 'Backend online — ML endpoint configured (not verified)',
        detail: 'The ML service was not probed in this check; submit a decision to request a live prediction.',
      }
    default:
      return {
        tone: 'unknown',
        title: 'Backend online — unrecognized health report',
        detail: 'The backend returned an ML service status this page does not recognize.',
      }
  }
}

const CHECKING = {
  tone: 'checking',
  title: 'Checking service status…',
  detail: 'Asking the backend for PostgreSQL and ML service health.',
}

function ServiceStatus() {
  const [state, setState] = useState(CHECKING)
  const [refreshKey, setRefreshKey] = useState(0)

  // Same async pattern as DecisionHistory: the effect only starts the
  // request, and setState happens in the promise callbacks — never
  // synchronously inside the effect (react(set-state-in-effect)). The
  // initial state is already CHECKING, so no extra render is needed.
  useEffect(() => {
    let cancelled = false
    getHealth({ probeMl: true })
      .then((health) => {
        if (!cancelled) setState(deriveServiceStatus(health))
      })
      .catch((error) => {
        if (cancelled) return
        setState({
          tone: 'down',
          title: 'Services offline — the backend is not responding',
          detail:
            error?.message ??
            'The backend did not answer. Start the services in the order described in the README, then recheck.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  function handleRecheck() {
    setState(CHECKING)
    setRefreshKey((key) => key + 1)
  }

  const checking = state.tone === 'checking'

  return (
    <div className={`service-status service-status--${state.tone}`} data-testid="service-status">
      <span className="service-status__dot" aria-hidden="true" />
      <div className="service-status__text" role="status" aria-live="polite">
        <strong className="service-status__title">{state.title}</strong>
        <span className="service-status__detail">{state.detail}</span>
      </div>
      <button
        type="button"
        className="service-status__recheck"
        onClick={handleRecheck}
        disabled={checking}
      >
        {checking ? 'Checking…' : 'Recheck'}
      </button>
    </div>
  )
}

export default ServiceStatus
