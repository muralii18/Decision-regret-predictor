import { useEffect, useState } from 'react'
import { getDecision, listDecisions } from '../lib/api'
import { decisionToRow, latestPrediction } from '../lib/display'
import DecisionsTable from './DecisionsTable'
import SummaryCards from './SummaryCards'

// One request fetches enough rows for the summary counts and the recent
// table. If the server holds more rows than this, the outcome counts are
// labelled with a trailing '+' (never presented as exact).
const FETCH_LIMIT = 100
const RECENT_COUNT = 5

/**
 * Dashboard — live data from the backend.
 *
 * Every number shown here is calculated from saved backend rows
 * (GET /api/decisions). If the backend is unreachable the dashboard shows
 * the error and a retry — it never silently reverts to demo results, and no
 * demo score is ever labelled as a model prediction. No extra backend
 * endpoints are used (or invented) for the charts.
 */
function DashboardView({ onNewPrediction, onShowResults }) {
  const [phase, setPhase] = useState('loading') // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState(null)
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [reloadKey, setReloadKey] = useState(0)
  const [openingId, setOpeningId] = useState(null)
  const [actionError, setActionError] = useState(null)

  // Loading is the initial state; retries re-enter it from the click handler
  // (never synchronously inside the effect).
  useEffect(() => {
    let cancelled = false
    listDecisions({ limit: FETCH_LIMIT, offset: 0 })
      .then((result) => {
        if (cancelled) return
        const { data, pagination } = result
        const withOutcome = data.filter((row) => row.outcome)
        setStats({
          totalDecisions: pagination.total,
          outcomesRecorded: withOutcome.length,
          reversedDecisions: withOutcome.filter((row) => row.outcome.outcome === 'reversed').length,
          awaitingOutcome: data.length - withOutcome.length,
          countsExact: data.length >= pagination.total,
        })
        setRecent(data.slice(0, RECENT_COUNT).map(decisionToRow))
        setPhase('ready')
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error?.message ?? 'The dashboard data could not be loaded.')
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  async function handleView(row) {
    if (openingId) return
    setOpeningId(row.id)
    setActionError(null)
    try {
      const decision = await getDecision(row.id)
      onShowResults({ decision, prediction: latestPrediction(decision) })
    } catch (error) {
      setActionError(error?.message ?? `Decision ${row.id} could not be loaded.`)
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Dashboard</h1>
          <p>Overview of your saved decision regret predictions — live from the backend.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={onNewPrediction}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Prediction
        </button>
      </div>

      {actionError && (
        <p className="app-alert app-alert--error" role="alert">
          {actionError}
        </p>
      )}

      {phase === 'loading' && (
        <section className="placeholder" role="status" aria-live="polite">
          <h2>Loading dashboard…</h2>
          <p>Fetching saved decisions from the backend.</p>
        </section>
      )}

      {phase === 'error' && (
        <section className="placeholder" role="alert">
          <h2>Dashboard data is unavailable</h2>
          <p>{loadError}</p>
          <div className="history__empty-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setPhase('loading')
                setLoadError(null)
                setReloadKey((key) => key + 1)
              }}
            >
              Retry
            </button>
            <button type="button" className="btn btn--secondary" onClick={onNewPrediction}>
              New Prediction
            </button>
          </div>
        </section>
      )}

      {phase === 'ready' && stats && stats.totalDecisions === 0 && (
        <section className="placeholder" role="status">
          <h2>No decisions saved yet</h2>
          <p>
            Nothing has been stored in PostgreSQL yet. Submit a decision with the New Prediction
            form and it will appear here with its prediction.
          </p>
          <div className="history__empty-actions">
            <button type="button" className="btn btn--primary" onClick={onNewPrediction}>
              New Prediction
            </button>
          </div>
        </section>
      )}

      {phase === 'ready' && stats && stats.totalDecisions > 0 && (
        <>
          <SummaryCards stats={stats} source="live" />
          <DecisionsTable
            decisions={recent}
            title="Recent Decisions"
            subtitle="The most recently saved decisions — live from the backend."
            dataTag="Live data"
            showRisk={false}
            showStatus={false}
            onView={handleView}
            viewBusyId={openingId}
            footerNote={
              stats.totalDecisions === 0
                ? 'No decisions have been saved yet.'
                : `Showing ${recent.length} of ${stats.totalDecisions} saved decision${stats.totalDecisions === 1 ? '' : 's'} — newest first. ` +
                  'Counts are calculated from saved rows; illustrative demo values are never shown as model predictions.'
            }
          />
        </>
      )}
    </>
  )
}

export default DashboardView
