import { describe, expect, test } from 'vitest'
import {
  EXPECTED_COLUMNS,
  FEATURE_COLUMNS,
  validateHistoricalCsvText,
} from './historicalCsv'

const HEADER = EXPECTED_COLUMNS.join(',')

function csv(...rows) {
  return [HEADER, ...rows.map((cells) => cells.join(','))].join('\n')
}

const VALID_ROW = [
  'DRP-0001',
  '2026-09-01',
  'Supplier Selection',
  '150000',
  '3',
  'Medium',
  'Selected a new logistics vendor before renewal.',
  'Lower shipping cost and faster delivery.',
  'Migration effort and vendor dependency.',
  '180',
  '1',
]

const UNKNOWN_ROW = [
  'DRP-0002',
  '2026-09-05',
  'Hiring',
  '90000',
  '2',
  'Low',
  'Hiring two buyers for the procurement team.',
  'Better category coverage and faster sourcing.',
  'Onboarding time and cultural fit.',
  '365',
  '', // empty target = outcome unknown
]

describe('historical CSV validation (existing behaviour preserved)', () => {
  test('valid rows pass; an empty target stays unknown and is never counted as 0', () => {
    const result = validateHistoricalCsvText(csv(VALID_ROW, UNKNOWN_ROW))

    expect(result.fileErrors).toEqual([])
    expect(result.stats).toEqual({
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
      unknownOutcomeRows: 1,
      labeledRows: 1,
    })

    const unknown = result.rows[1]
    expect(unknown.valid).toBe(true)
    expect(unknown.unknownOutcome).toBe(true)
    expect(unknown.record.target_reversed).toBe('') // unchanged — not converted to '0'
    expect(unknown.errors).toEqual([])
  })

  test('target values outside 0/1/empty are rejected', () => {
    const result = validateHistoricalCsvText(csv([...VALID_ROW.slice(0, 10), '2']))
    expect(result.rows[0].valid).toBe(false)
    expect(result.rows[0].errors.join(' ')).toMatch(/must be 1 .* or empty/)
  })

  test('missing columns are reported at file level', () => {
    const result = validateHistoricalCsvText(
      ['decision_id,decision_date,category', 'DRP-1,2026-09-01,Hiring'].join('\n'),
    )
    expect(result.fileErrors[0]).toMatch(/Missing required column/)
    expect(result.rows).toEqual([])
  })

  test('schema rules: categories, windows, dates and numerics', () => {
    const bad = [...VALID_ROW]
    bad[2] = 'Picking Lunch' // category
    bad[9] = '90' // observation window
    bad[1] = '2099-01-01' // future date
    const result = validateHistoricalCsvText(csv(bad))
    const errors = result.rows[0].errors.join(' ')
    expect(errors).toMatch(/Unknown category/)
    expect(errors).toMatch(/observation_window_days' must be one of 180 or 365/)
    expect(errors).toMatch(/in the future/)
  })
})

describe('leakage guard', () => {
  test('only the seven decision-time columns are model features', () => {
    expect(FEATURE_COLUMNS).toEqual([
      'category',
      'estimated_cost_usd',
      'num_alternatives',
      'confidence_level',
      'business_context',
      'expected_benefits',
      'identified_risks',
    ])
    // Outcome/context columns can never become prediction-time features.
    for (const column of ['decision_id', 'decision_date', 'observation_window_days', 'target_reversed']) {
      expect(FEATURE_COLUMNS).not.toContain(column)
      expect(EXPECTED_COLUMNS).toContain(column)
    }
  })
})
