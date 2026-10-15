import { useCallback, useEffect, useState } from 'react'
import { getDecision, listDecisions, recordOutcome } from '../lib/api'
import { decisionToRow, latestPrediction } from '../lib/display'
import DecisionsTable from './DecisionsTable'
import './DecisionHistory.css'

const PAGE_SIZE = 20

/**
 * Decision History — real saved data from the backend.
 *
 *  - GET /api/decisions (server pagination) for the list
 *  - GET /api/decisions/:id for a row's full detail + predictions
 *  - POST /api/decisions/:id/outcomes to record or update an outcome
 *    ('unknown' stays unknown — it is sent without a date and never
 *    converted to not_reversed)
 *
 * Shows loading, empty and API-error states explicitly; it never falls back
 * to demo data.
 */
function DecisionHistory({ onNewPrediction, onShowResults }) {
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ limit: PAGE_SIZE, offset: 0, total: 0 })
  const [phase, setPhase] = useState('loading') // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [openingId, setOpeningId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  // The loading phase is entered from the initiating handlers (mount state,
  // pagination clicks, retry) — never synchronously inside the effect.
  useEffect(() => {
    let cancelled = false
    listDecisions({ limit: PAGE_SIZE, offset: pagination.offset })
      .then((result) => {
        if (cancelled) return
        setRows(result.data.map(decisionToRow))
        setPagination(result.pagination)
        setPhase('ready')
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error?.message ?? 'The decision list could not be loaded.')
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [pagination.offset, reloadKey])

  const retry = useCallback(() => {
    setPhase('loading')
    setLoadError(null)
    setReloadKey((key) => key + 1)
  }, [])

  function goToOffset(nextOffset) {
    setPhase('loading')
    setLoadError(null)
    setPagination((prev) => ({ ...prev, offset: nextOffset }))
  }

  async function handleRecordOutcome(decisionId, record) {
    try {
      const saved = await recordOutcome(decisionId, record)
      setRows((prev) =>
        prev.map((row) =>
          row.id === String(decisionId)
            ? {
                ...row,
                outcome: {
                  outcome: saved.outcome,
                  outcomeDate: saved.outcome_date ?? null,
                  note: saved.note ?? null,
                },
              }
            : row,
        ),
      )
      setActionError(null)
      return { ok: true }
    } catch (error) {
      const message = error?.message ?? 'The outcome could not be saved.'
      setActionError(message)
      return { ok: false, message }
    }
  }

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

  const { limit, offset, total } = pagination
  const page = Math.floor(offset / Math.max(limit, 1)) + 1
  const pageCount = Math.max(1, Math.ceil(total / Math.max(limit, 1)))
  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd = Math.min(offset + rows.length, total)

  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Decision History</h1>
          <p>
            Saved decisions from PostgreSQL, newest first, with any actual outcomes you record.
          </p>
        </div>
      </div>

      {actionError && (
        <p className="app-alert app-alert--error" role="alert">
          {actionError}
        </p>
      )}

      {phase === 'loading' && (
        <section className="placeholder" role="status" aria-live="polite">
          <h2>Loading decisions…</h2>
          <p>Fetching the saved decision list from the backend.</p>
        </section>
      )}

      {phase === 'error' && (
        <section className="placeholder" role="alert">
          <h2>Decision history is unavailable</h2>
          <p>{loadError}</p>
          <div className="history__empty-actions">
            <button type="button" className="btn btn--primary" onClick={retry}>
              Retry
            </button>
            {onNewPrediction && (
              <button type="button" className="btn btn--secondary" onClick={onNewPrediction}>
                New Prediction
              </button>
            )}
          </div>
        </section>
      )}

      {phase === 'ready' && rows.length === 0 && (
        <section className="placeholder" role="status">
          <h2>No decisions saved yet</h2>
          <p>
            Nothing has been stored in PostgreSQL yet. Submit a decision with the New Prediction
            form and it will appear here.
          </p>
          {onNewPrediction && (
            <div className="history__empty-actions">
              <button type="button" className="btn btn--primary" onClick={onNewPrediction}>
                New Prediction
              </button>
            </div>
          )}
        </section>
      )}

      {phase === 'ready' && rows.length > 0 && (
        <>
          <DecisionsTable
            decisions={rows}
            title="Decision History"
            subtitle="Actual saved decisions and recorded outcomes — live from the backend."
            dataTag="PostgreSQL"
            showRisk={false}
            showStatus={false}
            onRecordOutcome={handleRecordOutcome}
            onView={handleView}
            viewBusyId={openingId}
            footerNote={
              `Showing ${rangeStart}–${rangeEnd} of ${total} saved decision${total === 1 ? '' : 's'} ` +
              '— newest first. Predictions are shown on the Prediction Results page; ' +
              'outcomes are persisted through POST /api/decisions/:id/outcomes.'
            }
          />

          <nav className="pager" aria-label="Decision history pagination">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => goToOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
            >
              Previous
            </button>
            <span className="pager__status">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => goToOffset(offset + limit)}
              disabled={offset + limit >= total}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </>
  )
}

export default DecisionHistory
