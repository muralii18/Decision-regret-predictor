import { useState } from 'react'
import { formatDemoDate, getRiskLevel } from '../data/demoData'
import './DecisionsTable.css'

// Outcome values mirror the backend contract (backend/src/validation/validate.js
// OUTCOMES, shared with the ML dataset's target_reversed semantics):
// - 'reversed'     -> a verified reversal
// - 'not_reversed' -> PROVISIONAL: this app does not track observation
//                     windows (180 or 365 days) for saved decisions, so this
//                     must never be treated as a final "not reversed" ML
//                     label (target 0).
// - 'unknown'      -> first-class state; persisted as unknown with no date,
//                     never silently converted to 'not_reversed'.
const OUTCOME_OPTIONS = [
  { value: 'reversed', label: 'Reversed' },
  { value: 'not_reversed', label: 'Not reversed' },
  { value: 'unknown', label: 'Unknown (still open)' },
]

function StatusBadge({ status }) {
  const toneClass =
    status === 'Reversed' ? 'badge--danger' : status === 'Pending' ? 'badge--warning' : 'badge--success'
  return <span className={`badge ${toneClass}`}>{status}</span>
}

function OutcomeBadge({ outcome }) {
  const label = OUTCOME_OPTIONS.find((option) => option.value === outcome)?.label ?? outcome
  const toneClass =
    outcome === 'reversed' ? 'badge--danger' : outcome === 'unknown' ? 'badge--warning' : 'badge--success'
  return <span className={`badge ${toneClass}`}>{label}</span>
}

function todayIsoDate() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Inline form for recording or editing one decision's actual outcome.
// Saves through the parent's async onSave (POST /api/decisions/:id/outcomes).
// A failed save keeps the form open and shows the server's message.
function OutcomeForm({ decision, initial, busy, onSave, onCancel }) {
  const [outcome, setOutcome] = useState(initial?.outcome ?? '')
  const [outcomeDate, setOutcomeDate] = useState(initial?.outcomeDate ?? todayIsoDate())
  const [note, setNote] = useState(initial?.note ?? '')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const isEdit = Boolean(initial)
  const needsDate = outcome !== '' && outcome !== 'unknown'

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving || busy) return

    const nextErrors = {}
    if (!outcome) {
      nextErrors.outcome = 'Please select an outcome.'
    } else if (outcome !== 'unknown') {
      // 'unknown' deliberately carries no date — the backend forbids one and
      // unknown must never be coerced into a dated result.
      if (!outcomeDate) {
        nextErrors.outcomeDate = 'Please provide the outcome date.'
      } else if (outcomeDate > todayIsoDate()) {
        nextErrors.outcomeDate = 'The outcome date cannot be in the future.'
      } else if (decision.date && outcomeDate < decision.date) {
        nextErrors.outcomeDate = `The outcome date cannot be before the decision date (${decision.date}).`
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    setSaveError(null)
    const result = await onSave({
      outcome,
      outcomeDate: outcome === 'unknown' ? null : outcomeDate,
      note: note.trim(),
    })
    setSaving(false)
    if (result && result.ok === false) {
      setSaveError(result.message || 'The outcome could not be saved. Please try again.')
    }
  }

  return (
    <form className="outcome-form" onSubmit={handleSubmit} noValidate>
      <h4 className="outcome-form__title">
        {isEdit ? 'Edit outcome' : 'Record outcome'} &mdash; {decision.name}
      </h4>

      <div className="outcome-form__grid">
        <div className="outcome-form__field">
          <label htmlFor={`outcome-value-${decision.id}`}>
            Actual outcome <span className="field__required" aria-hidden="true">*</span>
          </label>
          <select
            id={`outcome-value-${decision.id}`}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            aria-required="true"
            aria-invalid={errors.outcome ? 'true' : undefined}
            aria-describedby={errors.outcome ? `outcome-value-error-${decision.id}` : undefined}
          >
            <option value="">Select an outcome&hellip;</option>
            {OUTCOME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.outcome && (
            <p className="field__error" id={`outcome-value-error-${decision.id}`} role="alert">
              {errors.outcome}
            </p>
          )}
        </div>

        {needsDate && (
          <div className="outcome-form__field">
            <label htmlFor={`outcome-date-${decision.id}`}>
              Outcome date <span className="field__required" aria-hidden="true">*</span>
            </label>
            <input
              type="date"
              id={`outcome-date-${decision.id}`}
              value={outcomeDate}
              max={todayIsoDate()}
              onChange={(event) => setOutcomeDate(event.target.value)}
              aria-required="true"
              aria-invalid={errors.outcomeDate ? 'true' : undefined}
              aria-describedby={errors.outcomeDate ? `outcome-date-error-${decision.id}` : undefined}
            />
            {errors.outcomeDate && (
              <p className="field__error" id={`outcome-date-error-${decision.id}`} role="alert">
                {errors.outcomeDate}
              </p>
            )}
          </div>
        )}

        <div className="outcome-form__field outcome-form__field--full">
          <label htmlFor={`outcome-note-${decision.id}`}>Note (optional)</label>
          <input
            type="text"
            id={`outcome-note-${decision.id}`}
            value={note}
            maxLength={200}
            placeholder="e.g. Contract cancelled after missed delivery deadlines"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      {outcome === 'unknown' && (
        <p className="outcome-form__session-note" role="note">
          An unknown outcome stays open: it is saved as &ldquo;unknown&rdquo; without a date and is
          never converted to &ldquo;not reversed&rdquo;.
        </p>
      )}

      {outcome === 'not_reversed' && (
        <p className="outcome-form__window-note" role="note">
          Observation window: this application does not yet track observation windows (180 or 365
          days in the ML dataset) for saved decisions, so a &ldquo;Not reversed&rdquo; outcome here
          is <strong>provisional only</strong> and will not be used as a final
          &ldquo;not reversed&rdquo; machine-learning label (target&nbsp;0).
        </p>
      )}

      {saveError && (
        <p className="field__error" role="alert">
          {saveError}
        </p>
      )}

      <div className="outcome-form__actions">
        <button type="submit" className="btn btn--primary" disabled={saving || busy}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * Shared decisions table.
 *
 * Demo variant (default): risk score + status columns from sample data.
 * Live variant (showRisk={false} showStatus={false}): rows mapped from
 * backend decisions via lib/display decisionToRow, plus optional recorded
 * outcome (POST /api/decisions/:id/outcomes) and a View action.
 */
function DecisionsTable({
  decisions,
  title = 'Recent Decisions',
  subtitle = 'Latest entries from the sample dataset',
  footerNote,
  riskScoreHeader = 'Risk Score',
  statusHeader = 'Status',
  dataTag = 'Demo data',
  showRisk = true,
  showStatus = true,
  outcomes,
  onRecordOutcome,
  onView,
  viewBusyId = null,
}) {
  const [editingId, setEditingId] = useState(null)

  // Outcome columns appear wherever the parent supplies onRecordOutcome;
  // rows may carry their own server-recorded outcome (live) or a session
  // record keyed by id (legacy/demo usage).
  const trackOutcomes = typeof onRecordOutcome === 'function'
  const hasViewAction = typeof onView === 'function'
  const columnCount =
    1 + // decision
    (showRisk ? 1 : 0) +
    (showStatus ? 1 : 0) +
    1 + // date
    (trackOutcomes ? 1 : 0) + // recorded outcome
    (trackOutcomes || hasViewAction ? 1 : 0) // actions

  async function handleSaveOutcome(decisionId, record) {
    const result = await onRecordOutcome(decisionId, record)
    if (result && result.ok !== false) setEditingId(null)
    return result
  }

  const defaultFooterNote = `Showing ${decisions.length} of ${decisions.length} demo records &mdash; sample data for layout preview only.`

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h3 className="panel__title">{title}</h3>
          <p className="panel__subtitle">{subtitle}</p>
        </div>
        <span className="panel__demo-tag">{dataTag}</span>
      </div>

      <div className="table-wrap">
        <table className="decisions-table">
          <caption className="visually-hidden">
            {title} with category
            {showRisk ? `, ${riskScoreHeader.toLowerCase()}` : ''}
            {showStatus ? `, ${statusHeader.toLowerCase()}` : ''}
            , date
            {trackOutcomes ? ', recorded actual outcome and outcome actions' : ''}
            {hasViewAction ? ', view details' : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">Decision</th>
              <th scope="col">Category</th>
              {showRisk && <th scope="col">{riskScoreHeader}</th>}
              {showStatus && <th scope="col">{statusHeader}</th>}
              <th scope="col">Date</th>
              {trackOutcomes && <th scope="col">Actual Outcome</th>}
              {(trackOutcomes || hasViewAction) && (
                <th scope="col">
                  <span className="visually-hidden">Row actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {decisions.map((decision) => {
              const record = trackOutcomes ? (decision.outcome ?? outcomes?.[decision.id] ?? null) : null
              const isEditing = editingId === decision.id

              return (
                <DecisionRow
                  key={decision.id}
                  decision={decision}
                  record={record}
                  isEditing={isEditing}
                  trackOutcomes={trackOutcomes}
                  showRisk={showRisk}
                  showStatus={showStatus}
                  hasViewAction={hasViewAction}
                  columnCount={columnCount}
                  viewBusy={viewBusyId === decision.id}
                  onToggleEdit={() => setEditingId(isEditing ? null : decision.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(nextRecord) => handleSaveOutcome(decision.id, nextRecord)}
                  onView={() => onView(decision)}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="panel__footer-note">{footerNote ?? defaultFooterNote}</p>
    </section>
  )
}

function DecisionRow({
  decision,
  record,
  isEditing,
  trackOutcomes,
  showRisk,
  showStatus,
  hasViewAction,
  columnCount,
  viewBusy,
  onToggleEdit,
  onCancelEdit,
  onSave,
  onView,
}) {
  return (
    <>
      <tr>
        <td className="cell-name">{decision.name}</td>
        <td>
          <span className="category-tag">{decision.category}</span>
        </td>
        {showRisk && (
          <td>
            <div className="risk-cell">
              <span className={`risk-score risk-score--${getRiskLevel(decision.riskScore)}`}>
                {decision.riskScore}%
              </span>
              <span className="risk-bar" aria-hidden="true">
                <span
                  className={`risk-bar__fill risk-bar__fill--${getRiskLevel(decision.riskScore)}`}
                  style={{ width: `${decision.riskScore}%` }}
                />
              </span>
            </div>
          </td>
        )}
        {showStatus && (
          <td>
            <StatusBadge status={decision.status} />
          </td>
        )}
        <td className="cell-date">{formatDemoDate(decision.date)}</td>

        {trackOutcomes && (
          <td>
            {record ? (
              <div className="outcome-cell">
                <OutcomeBadge outcome={record.outcome} />
                {record.outcomeDate && (
                  <span className="outcome-cell__date">{formatDemoDate(record.outcomeDate)}</span>
                )}
                {record.outcome === 'not_reversed' && (
                  <span className="outcome-cell__provisional">
                    Provisional &mdash; observation window not yet defined
                  </span>
                )}
                {record.note && <span className="outcome-cell__note">{record.note}</span>}
              </div>
            ) : (
              <span className="outcome-cell__empty">Not recorded</span>
            )}
          </td>
        )}

        {(trackOutcomes || hasViewAction) && (
          <td className="outcome-cell__actions">
            {hasViewAction && (
              <button
                type="button"
                className="btn btn--secondary outcome-action-btn"
                onClick={onView}
                disabled={viewBusy}
              >
                {viewBusy ? 'Opening…' : 'View'}
              </button>
            )}
            {trackOutcomes && (
              <button
                type="button"
                className="btn btn--secondary outcome-action-btn"
                onClick={onToggleEdit}
                aria-expanded={isEditing}
              >
                {isEditing ? 'Close' : record ? 'Edit outcome' : 'Record outcome'}
              </button>
            )}
          </td>
        )}
      </tr>

      {isEditing && (
        <tr className="outcome-form-row">
          <td colSpan={columnCount}>
            <OutcomeForm decision={decision} initial={record} onSave={onSave} onCancel={onCancelEdit} />
          </td>
        </tr>
      )}
    </>
  )
}

export default DecisionsTable
