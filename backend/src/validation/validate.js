/**
 * Request validation. Pure functions — no Express, no database.
 *
 * Constraints mirror the existing contracts:
 *  - categories / confidence: frontend New Decision form and ML
 *    preprocessing (ml/preprocessing/preprocess.py) — keep in sync;
 *  - text minimums and numeric rules: frontend NewDecisionForm.jsx;
 *  - cost > 0 and feature names: the ML schema (the seven features).
 */

// Keep in sync with frontend/src/components/NewDecisionForm.jsx and
// ml/preprocessing/preprocess.py VALID_CATEGORIES.
export const CATEGORIES = [
  'Hiring',
  'Supplier Selection',
  'Project Approval',
  'Equipment Purchase',
  'Product Launch',
  'Technology Selection',
]

export const CONFIDENCE_LEVELS = ['Low', 'Medium', 'High']

// 'unknown' is a first-class outcome — never coerced to 'not_reversed'.
export const OUTCOMES = ['reversed', 'not_reversed', 'unknown']

// The only fields accepted on a decision (application metadata + the seven
// ML features). Anything else is rejected, mirroring the ML API's
// extra='forbid' rule so outcome/label columns can never sneak in.
export const DECISION_FIELDS = [
  'title',
  'decision_date',
  'category',
  'estimated_cost_usd',
  'num_alternatives',
  'confidence_level',
  'business_context',
  'expected_benefits',
  'identified_risks',
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_TEXT = 5000
const MAX_NOTE = 200

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Today's date as YYYY-MM-DD (local time), for not-in-the-future checks. */
export function todayIso(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** True for a real calendar date in ISO format (rejects 2025-02-31 etc.). */
export function isRealIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function checkUnknownFields(body, allowed, errors) {
  const extra = Object.keys(body).filter((key) => !allowed.includes(key))
  if (extra.length > 0) {
    errors.push({
      field: extra.join(','),
      message: `Unexpected field(s): ${extra.join(', ')}. Only ${allowed.join(', ')} are accepted.`,
    })
  }
}

function checkText(body, field, errors, { min, max = MAX_TEXT }) {
  const value = body[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push({ field, message: `${field} is required and must be a non-empty string.` })
  } else if (value.trim().length < min) {
    errors.push({ field, message: `${field} must be at least ${min} characters.` })
  } else if (value.length > max) {
    errors.push({ field, message: `${field} must be at most ${max} characters.` })
  }
}

/**
 * Validate a create-decision request body.
 * Returns { ok, errors, value } — value is the cleaned row when ok.
 */
export function validateDecisionInput(body, { today = todayIso() } = {}) {
  const errors = []
  if (!isPlainObject(body)) {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }], value: null }
  }
  checkUnknownFields(body, DECISION_FIELDS, errors)

  checkText(body, 'title', errors, { min: 3, max: 200 })

  if (!CATEGORIES.includes(body.category)) {
    errors.push({ field: 'category', message: `category must be one of: ${CATEGORIES.join(', ')}.` })
  }

  if (typeof body.estimated_cost_usd !== 'number' || !Number.isFinite(body.estimated_cost_usd) || body.estimated_cost_usd <= 0) {
    errors.push({ field: 'estimated_cost_usd', message: 'estimated_cost_usd must be a number greater than 0 (the ML schema requires > 0).' })
  }

  if (!Number.isInteger(body.num_alternatives) || body.num_alternatives < 0 || body.num_alternatives > 1000) {
    errors.push({ field: 'num_alternatives', message: 'num_alternatives must be a whole number between 0 and 1000.' })
  }

  if (!CONFIDENCE_LEVELS.includes(body.confidence_level)) {
    errors.push({ field: 'confidence_level', message: `confidence_level must be one of: ${CONFIDENCE_LEVELS.join(', ')}.` })
  }

  checkText(body, 'business_context', errors, { min: 10 })
  checkText(body, 'expected_benefits', errors, { min: 10 })
  checkText(body, 'identified_risks', errors, { min: 10 })

  let decisionDate = body.decision_date ?? today
  if (!isRealIsoDate(decisionDate)) {
    errors.push({ field: 'decision_date', message: 'decision_date must be a valid ISO date (YYYY-MM-DD).' })
  } else if (decisionDate > today) {
    errors.push({ field: 'decision_date', message: 'decision_date cannot be in the future.' })
  }

  if (errors.length > 0) return { ok: false, errors, value: null }

  return {
    ok: true,
    errors: [],
    value: {
      title: body.title.trim(),
      decision_date: decisionDate,
      category: body.category,
      estimated_cost_usd: body.estimated_cost_usd,
      num_alternatives: body.num_alternatives,
      confidence_level: body.confidence_level,
      business_context: body.business_context.trim(),
      expected_benefits: body.expected_benefits.trim(),
      identified_risks: body.identified_risks.trim(),
    },
  }
}

/**
 * Validate a record-or-update outcome request body against the parent
 * decision (decision_date from the database).
 */
export function validateOutcomeInput(body, { decisionDate, today = todayIso() } = {}) {
  const errors = []
  if (!isPlainObject(body)) {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }], value: null }
  }
  checkUnknownFields(body, ['outcome', 'outcome_date', 'note'], errors)

  if (!OUTCOMES.includes(body.outcome)) {
    errors.push({ field: 'outcome', message: `outcome must be one of: ${OUTCOMES.join(', ')}.` })
  }

  const hasDate = body.outcome_date !== undefined && body.outcome_date !== null && body.outcome_date !== ''
  if (body.outcome !== 'unknown' && !hasDate) {
    errors.push({ field: 'outcome_date', message: 'outcome_date is required for reversed / not_reversed outcomes.' })
  }
  if (hasDate) {
    if (!isRealIsoDate(body.outcome_date)) {
      errors.push({ field: 'outcome_date', message: 'outcome_date must be a valid ISO date (YYYY-MM-DD).' })
    } else {
      if (body.outcome_date > today) {
        errors.push({ field: 'outcome_date', message: 'outcome_date cannot be in the future.' })
      }
      if (decisionDate && body.outcome_date < decisionDate) {
        errors.push({ field: 'outcome_date', message: `outcome_date cannot be before the decision date (${decisionDate}).` })
      }
    }
  }
  if (body.outcome === 'unknown' && hasDate) {
    // An unknown outcome keeps its window open — a date would imply a known
    // assessment point, which the schema forbids.
    errors.push({ field: 'outcome_date', message: 'outcome_date must be omitted for an unknown outcome.' })
  }

  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string' || body.note.length > MAX_NOTE) {
      errors.push({ field: 'note', message: `note must be a string of at most ${MAX_NOTE} characters.` })
    }
  }

  if (errors.length > 0) return { ok: false, errors, value: null }

  return {
    ok: true,
    errors: [],
    value: {
      outcome: body.outcome,
      outcome_date: hasDate ? body.outcome_date : null,
      note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim() : null,
    },
  }
}

/** Validate a numeric path id (BIGSERIAL ids arrive as strings). */
export function parseId(raw) {
  if (typeof raw !== 'string' || !/^\d{1,18}$/.test(raw)) return null
  return raw
}

/** Validate ?limit=&offset= pagination parameters. */
export function parsePagination(query) {
  const errors = []
  const toInt = (raw, fallback) => {
    if (raw === undefined) return fallback
    const value = Number(raw)
    if (!Number.isInteger(value)) return null
    return value
  }
  const limit = toInt(query.limit, 20)
  const offset = toInt(query.offset, 0)
  if (limit === null || limit < 1 || limit > 100) {
    errors.push({ field: 'limit', message: 'limit must be an integer between 1 and 100.' })
  }
  if (offset === null || offset < 0) {
    errors.push({ field: 'offset', message: 'offset must be a non-negative integer.' })
  }
  if (errors.length > 0) return { ok: false, errors, value: null }
  return { ok: true, errors, value: { limit, offset } }
}
