import { useState } from 'react'
import { formatDemoDate, getRiskLevel } from '../data/demoData'
import './DecisionsTable.css'

// Outcome values mirror the ML dataset's target_reversed semantics:
// - 'reversed'     -> a verified reversal (target 1 at that date)
// - 'not_reversed' -> PROVISIONAL only: the applicable observation window
//                     (180 or 365 days in the ML dataset) is not defined for
//                     demo decisions, so this must never be treated as a
//                     final "not reversed" ML label (target 0).
// Outcomes are session-only React state — not persisted anywhere yet.
const OUTCOME_OPTIONS = [
  { value: 'reversed', label: 'Reversed' },
  { value: 'not_reversed', label: 'Not reversed' },
]

function StatusBadge({ status }) {
  const toneClass =
    status === 'Reversed' ? 'badge--danger' : status === 'Pending' ? 'badge--warning' : 'badge--success'
  return <span className={`badge ${toneClass}`}>{status}</span>
}

function OutcomeBadge({ outcome }) {
  const label = OUTCOME_OPTIONS.find((option) => option.value === outcome)?.label ?? outcome
  const toneClass = outcome === 'reversed' ? 'badge--danger' : 'badge--warning'
  return <span className={`badge ${toneClass}`}>{label}</span>
}

function todayIsoDate() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Inline form for recording or editing one decision's actual outcome.
function OutcomeForm({ decision, initial, onSave, onCancel }) {
  const [outcome, setOutcome] = useState(initial?.outcome ?? '')
  const [outcomeDate, setOutcomeDate] = useState(initial?.outcomeDate ?? todayIsoDate())
  const [note, setNote] = useState(initial?.note ?? '')
  const [errors, setErrors] = useState({})

  const isEdit = Boolean(initial)

  function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!outcome) {
      nextErrors.outcome = 'Please select an outcome.'
    }
    if (!outcomeDate) {
      nextErrors.outcomeDate = 'Please provide the outcome date.'
    } else if (outcomeDate > todayIsoDate()) {
      nextErrors.outcomeDate = 'The outcome date cannot be in the future.'
    } else if (decision.date && outcomeDate < decision.date) {
      nextErrors.outcomeDate = `The outcome date cannot be before the decision date (${decision.date}).`
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) {
      onSave({ outcome, outcomeDate, note: note.trim() })
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

      {outcome === 'not_reversed' && (
        <p className="outcome-form__window-note" role="note">
          Observation window: the observation window (180 or 365 days in the ML dataset) is not
          defined for this demo decision. A &ldquo;Not reversed&rdquo; outcome here is{' '}
          <strong>provisional only</strong> and will not be used as a final &ldquo;not reversed&rdquo;
          machine-learning label (target&nbsp;0).
        </p>
      )}

      <p className="outcome-form__session-note" role="note">
        Outcomes are stored in this session only &mdash; they are not yet saved to PostgreSQL.
      </p>

      <div className="outcome-form__actions">
        <button type="submit" className="btn btn--primary">
          Save
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function DecisionsTable({
  decisions,
  title = 'Recent Decisions',
  subtitle = 'Latest entries from the sample dataset',
  footerNote,
  riskScoreHeader = 'Risk Score',
  statusHeader = 'Status',
  outcomes,
  onRecordOutcome,
}) {
  const [editingId, setEditingId] = useState(null)

  // The outcome columns and actions appear only where the parent supplies the
  // outcome props — the dashboard call site keeps its current behavior.
  const trackOutcomes = typeof onRecordOutcome === 'function' && outcomes != null
  const columnCount = trackOutcomes ? 7 : 5

  function handleSaveOutcome(decisionId, record) {
    onRecordOutcome(decisionId, record)
    setEditingId(null)
  }

  const defaultFooterNote = `Showing ${decisions.length} of ${decisions.length} demo records &mdash; sample data for layout preview only.`

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h3 className="panel__title">{title}</h3>
          <p className="panel__subtitle">{subtitle}</p>
        </div>
        <span className="panel__demo-tag">Demo data</span>
      </div>

      <div className="table-wrap">
        <table className="decisions-table">
          <caption className="visually-hidden">
            {title} with category, demo regret risk score, status, date
            {trackOutcomes ? ', recorded actual outcome and outcome actions' : ''} (demo sample data)
          </caption>
          <thead>
            <tr>
              <th scope="col">Decision</th>
              <th scope="col">Category</th>
              <th scope="col">{riskScoreHeader}</th>
              <th scope="col">{statusHeader}</th>
              <th scope="col">Date</th>
              {trackOutcomes && <th scope="col">Actual Outcome</th>}
              {trackOutcomes && (
                <th scope="col">
                  <span className="visually-hidden">Outcome actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {decisions.map((decision) => {
              const record = outcomes?.[decision.id]
              const isEditing = editingId === decision.id

              return (
                <DecisionRow
                  key={decision.id}
                  decision={decision}
                  record={record}
                  isEditing={isEditing}
                  trackOutcomes={trackOutcomes}
                  columnCount={columnCount}
                  onToggleEdit={() => setEditingId(isEditing ? null : decision.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(nextRecord) => handleSaveOutcome(decision.id, nextRecord)}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="panel__footer-note">
        {footerNote ?? defaultFooterNote}
      </p>
    </section>
  )
}

function DecisionRow({
  decision,
  record,
  isEditing,
  trackOutcomes,
  columnCount,
  onToggleEdit,
  onCancelEdit,
  onSave,
}) {
  return (
    <>
      <tr>
        <td className="cell-name">{decision.name}</td>
        <td>
          <span className="category-tag">{decision.category}</span>
        </td>
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
        <td>
          <StatusBadge status={decision.status} />
        </td>
        <td className="cell-date">{formatDemoDate(decision.date)}</td>

        {trackOutcomes && (
          <td>
            {record ? (
              <div className="outcome-cell">
                <OutcomeBadge outcome={record.outcome} />
                <span className="outcome-cell__date">{formatDemoDate(record.outcomeDate)}</span>
                {record.outcome === 'not_reversed' && (
                  <span className="outcome-cell__provisional">
                    Provisional &mdash; observation window not defined for demo data
                  </span>
                )}
                {record.note && <span className="outcome-cell__note">{record.note}</span>}
              </div>
            ) : (
              <span className="outcome-cell__empty">Not recorded</span>
            )}
          </td>
        )}

        {trackOutcomes && (
          <td className="outcome-cell__actions">
            <button
              type="button"
              className="btn btn--secondary outcome-action-btn"
              onClick={onToggleEdit}
              aria-expanded={isEditing}
            >
              {isEditing ? 'Close' : record ? 'Edit outcome' : 'Record outcome'}
            </button>
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
