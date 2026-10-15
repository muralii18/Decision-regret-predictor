// ---------------------------------------------------------------------------
// Shared display helpers: keep IDs, dates, percentages and JSON response
// fields handled consistently across the dashboard, history and results
// views. These functions only shape/label data that came from the backend —
// they never invent values.
// ---------------------------------------------------------------------------

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Map a backend decision (list or detail row) to the table row shape. */
export function decisionToRow(decision) {
  if (!decision) return null
  return {
    id: String(decision.id),
    name: decision.title,
    category: decision.category,
    date: decision.decision_date,
    outcome: outcomeToRecord(decision.outcome),
  }
}

/** Map a backend outcome object (or null) to the outcome-record shape. */
export function outcomeToRecord(outcome) {
  if (!outcome) return null
  return {
    outcome: outcome.outcome,
    outcomeDate: outcome.outcome_date ?? null,
    note: outcome.note ?? null,
  }
}

/** Newest saved prediction from a GET /api/decisions/:id payload (or null). */
export function latestPrediction(detail) {
  const predictions = Array.isArray(detail?.predictions) ? detail.predictions : []
  return predictions.length > 0 ? predictions[0] : null
}

/** Format an ISO date (YYYY-MM-DD or full timestamp) for display. */
export function formatIsoDate(value) {
  if (typeof value !== 'string' || value === '') return '—'
  const date = new Date(ISO_DAY.test(value) ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Format a percentage value (already 0–100) with a fixed number of digits. */
export function formatPercent(value, digits = 1) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return `${number.toFixed(digits)}%`
}

/** Format a USD amount. */
export function formatUsd(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}
