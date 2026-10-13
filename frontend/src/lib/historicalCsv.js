// ---------------------------------------------------------------------------
// CSV parsing + schema validation for the Historical Data Upload page.
//
// The schema and rules mirror the ML service's validator exactly
// (ml/preprocessing/preprocess.py): the same 11 columns, the same category /
// confidence / observation-window enums, and the same target semantics
// (1 = reversed within the window, 0 = not reversed within it, empty =
// unknown). Unknown outcomes stay unknown: they are flagged as unsuitable for
// supervised training, never converted to 0, and never make the file invalid
// on their own.
//
// This module runs entirely in the browser. Nothing is uploaded, stored or
// sent to a backend. Uploaded values are never modified — problems are
// reported, not fixed.
// ---------------------------------------------------------------------------

export const EXPECTED_COLUMNS = [
  'decision_id',
  'decision_date',
  'category',
  'estimated_cost_usd',
  'num_alternatives',
  'confidence_level',
  'business_context',
  'expected_benefits',
  'identified_risks',
  'observation_window_days',
  'target_reversed',
]

// Decision-time information only — the only legitimate model inputs.
// Outcome/context columns (decision_id, decision_date,
// observation_window_days, target_reversed) must never become features.
export const FEATURE_COLUMNS = [
  'category',
  'estimated_cost_usd',
  'num_alternatives',
  'confidence_level',
  'business_context',
  'expected_benefits',
  'identified_risks',
]

export const VALID_CATEGORIES = [
  'Hiring',
  'Supplier Selection',
  'Project Approval',
  'Equipment Purchase',
  'Product Launch',
  'Technology Selection',
]

export const VALID_CONFIDENCE_LEVELS = ['Low', 'Medium', 'High']
export const VALID_OBSERVATION_WINDOWS = [180, 365]

export const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB — keeps browser parsing responsive

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ---------------------------------------------------------------------------
// CSV parser (RFC-4180 style): handles quoted fields, escaped quotes (""),
// commas and newlines inside quotes, CRLF/LF, and a UTF-8 BOM. Returns
// { rows, error }; on error the partial rows are still returned for context.
// ---------------------------------------------------------------------------
export function parseCsv(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { rows: [], error: 'The file is empty.' }
  }

  // Strip a UTF-8 BOM if present.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  if (source.trim().length === 0) {
    return { rows: [], error: 'The file is empty.' }
  }

  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = source.length

  while (i < n) {
    const ch = source[i]

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"' // escaped quote
          i += 2
          continue
        }
        inQuotes = false // closing quote
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      if (field.length > 0) {
        return {
          rows,
          error: `Malformed CSV: unexpected quote inside a value (character ${i + 1}). ` +
            'Quote characters must wrap a whole field, and literal quotes inside a quoted field must be doubled ("").',
        }
      }
      inQuotes = true
      i += 1
      continue
    }

    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1 // CRLF
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }

    field += ch
    i += 1
  }

  if (inQuotes) {
    return {
      rows,
      error: 'Malformed CSV: a quoted value is never closed (missing the closing double quote).',
    }
  }

  // Final row when the file does not end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  if (rows.length === 0) {
    return { rows: [], error: 'The file is empty.' }
  }

  return { rows, error: null }
}

function todayIsoDate() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function isRealIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

// ---------------------------------------------------------------------------
// Validate parsed rows against the historical dataset schema.
// Returns:
//   fileErrors: string[]            — file-level problems (schema, emptiness)
//   rows: Array<{ rowNumber, record, errors, unknownOutcome, valid }>
//   stats: { totalRows, validRows, invalidRows, unknownOutcomeRows, labeledRows }
// rowNumber is the DATA row number (header excluded), matching what the
// error list shows the user.
// ---------------------------------------------------------------------------
export function validateHistoricalRows(header, dataRows) {
  const fileErrors = []
  const headerTrimmed = header.map((cell) => cell.trim())

  const missing = EXPECTED_COLUMNS.filter((col) => !headerTrimmed.includes(col))
  const unexpected = headerTrimmed.filter((col) => col !== '' && !EXPECTED_COLUMNS.includes(col))
  const emptyHeaderCells = headerTrimmed.reduce(
    (count, col, index) => (col === '' ? [...count, index + 1] : count),
    [],
  )

  if (missing.length > 0) {
    fileErrors.push(`Missing required column(s): ${missing.join(', ')}.`)
  }
  if (unexpected.length > 0) {
    fileErrors.push(
      `Unexpected column(s): ${unexpected.join(', ')}. Allowed columns: ${EXPECTED_COLUMNS.join(', ')}.`,
    )
  }
  if (emptyHeaderCells.length > 0) {
    fileErrors.push(`Header has an empty column name at position(s): ${emptyHeaderCells.join(', ')}.`)
  }

  // Without the exact schema, per-row validation cannot run reliably.
  if (missing.length > 0 || unexpected.length > 0 || emptyHeaderCells.length > 0) {
    return {
      fileErrors,
      rows: [],
      stats: { totalRows: dataRows.length, validRows: 0, invalidRows: 0, unknownOutcomeRows: 0, labeledRows: 0 },
    }
  }

  if (dataRows.length === 0) {
    fileErrors.push('The file has a header row but no data rows.')
    return {
      fileErrors,
      rows: [],
      stats: { totalRows: 0, validRows: 0, invalidRows: 0, unknownOutcomeRows: 0, labeledRows: 0 },
    }
  }

  const index = Object.fromEntries(headerTrimmed.map((col, i) => [col, i]))
  const seenIds = new Map() // id -> first row number
  const today = todayIsoDate()

  const rows = dataRows.map((cells, rowIndex) => {
    const rowNumber = rowIndex + 1
    const errors = []

    const record = {}
    for (const col of EXPECTED_COLUMNS) {
      record[col] = (cells[index[col]] ?? '').trim()
    }

    // A completely blank line is reported, not silently skipped.
    if (cells.every((cell) => cell.trim() === '')) {
      errors.push('Row is empty (blank line).')
      return { rowNumber, record, errors, unknownOutcome: false, valid: false }
    }

    if (cells.length !== EXPECTED_COLUMNS.length) {
      errors.push(
        `Expected ${EXPECTED_COLUMNS.length} values but found ${cells.length}. ` +
        'Check for stray commas or missing values (quote fields that contain commas).',
      )
    }

    // Required non-empty text/enum fields (mirrors the ML validator).
    for (const col of ['decision_id', 'decision_date', 'category', 'confidence_level',
      'business_context', 'expected_benefits', 'identified_risks']) {
      if (record[col] === '') {
        errors.push(`'${col}' is required and must not be empty.`)
      }
    }

    // decision_id uniqueness (schema documents ids as unique).
    if (record.decision_id !== '') {
      if (seenIds.has(record.decision_id)) {
        errors.push(`Duplicate decision_id '${record.decision_id}' (first used by row ${seenIds.get(record.decision_id)}).`)
      } else {
        seenIds.set(record.decision_id, rowNumber)
      }
    }

    // Numeric: estimated_cost_usd > 0.
    if (record.estimated_cost_usd !== '') {
      const cost = Number(record.estimated_cost_usd)
      if (!Number.isFinite(cost)) {
        errors.push(`'estimated_cost_usd' is not a number: '${record.estimated_cost_usd}'.`)
      } else if (cost <= 0) {
        errors.push(`'estimated_cost_usd' must be greater than 0 (found ${record.estimated_cost_usd}).`)
      }
    }

    // Numeric: num_alternatives is a non-negative integer.
    if (record.num_alternatives !== '') {
      const alts = Number(record.num_alternatives)
      if (!Number.isFinite(alts) || !Number.isInteger(alts) || alts < 0) {
        errors.push(`'num_alternatives' must be a non-negative whole number (found '${record.num_alternatives}').`)
      }
    }

    // Dates: ISO format, real calendar date, not in the future.
    if (record.decision_date !== '') {
      if (!isRealIsoDate(record.decision_date)) {
        errors.push(`'decision_date' must be an ISO date (YYYY-MM-DD): '${record.decision_date}'.`)
      } else if (record.decision_date > today) {
        errors.push(`'decision_date' is in the future: '${record.decision_date}'.`)
      }
    }

    // Observation window: exactly 180 or 365 (unknown windows are invalid —
    // outcome assessment would be undefined).
    if (record.observation_window_days !== '') {
      const window = Number(record.observation_window_days)
      if (!Number.isInteger(window) || !VALID_OBSERVATION_WINDOWS.includes(window)) {
        errors.push(`'observation_window_days' must be one of ${VALID_OBSERVATION_WINDOWS.join(' or ')} (found '${record.observation_window_days}').`)
      }
    } else {
      errors.push("'observation_window_days' is required (180 or 365).")
    }

    // Category / confidence enums.
    if (record.category !== '' && !VALID_CATEGORIES.includes(record.category)) {
      errors.push(`Unknown category '${record.category}'. Allowed: ${VALID_CATEGORIES.join(', ')}.`)
    }
    if (record.confidence_level !== '' && !VALID_CONFIDENCE_LEVELS.includes(record.confidence_level)) {
      errors.push(`Unknown confidence_level '${record.confidence_level}'. Allowed: ${VALID_CONFIDENCE_LEVELS.join(', ')}.`)
    }

    // Target: '1', '0' or empty (unknown). Anything else is an error. An
    // empty target is NOT an error and is NEVER converted to 0.
    let unknownOutcome = false
    if (record.target_reversed === '') {
      unknownOutcome = true
    } else if (record.target_reversed !== '0' && record.target_reversed !== '1') {
      errors.push(`'target_reversed' must be 1 (reversed), 0 (not reversed) or empty (outcome unknown) — found '${record.target_reversed}'.`)
    }

    return { rowNumber, record, errors, unknownOutcome, valid: errors.length === 0 }
  })

  const validRows = rows.filter((row) => row.valid).length
  const stats = {
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    unknownOutcomeRows: rows.filter((row) => row.valid && row.unknownOutcome).length,
    labeledRows: rows.filter((row) => row.valid && !row.unknownOutcome).length,
  }

  return { fileErrors, rows, stats }
}

// Convenience wrapper: full text -> validation result, with file-size and
// parse guards handled in one place.
export function validateHistoricalCsvText(text) {
  if (text.length > MAX_FILE_BYTES) {
    return {
      fileErrors: [`File is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB. Split it into smaller files before uploading.`],
      rows: [],
      stats: { totalRows: 0, validRows: 0, invalidRows: 0, unknownOutcomeRows: 0, labeledRows: 0 },
    }
  }

  const { rows, error } = parseCsv(text)
  if (error) {
    return {
      fileErrors: [error],
      rows: [],
      stats: { totalRows: 0, validRows: 0, invalidRows: 0, unknownOutcomeRows: 0, labeledRows: 0 },
    }
  }

  const [header, ...dataRows] = rows
  return validateHistoricalRows(header, dataRows)
}
