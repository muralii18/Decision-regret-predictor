/** Unit tests for src/validation/validate.js (pure functions, no IO). */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseId,
  parsePagination,
  todayIso,
  validateDecisionInput,
  validateOutcomeInput,
} from '../src/validation/validate.js'
import { VALID_DECISION } from './helpers.js'

const TODAY = '2026-10-14'

function fields(result) {
  return result.errors.map((error) => error.field)
}

test('valid decision payload passes and is cleaned', () => {
  const result = validateDecisionInput(
    { ...VALID_DECISION, title: '  Padded title  ' },
    { today: TODAY },
  )
  assert.equal(result.ok, true)
  assert.equal(result.value.title, 'Padded title')
  assert.equal(result.value.decision_date, TODAY, 'decision_date defaults to today')
  assert.equal(result.value.estimated_cost_usd, 250_000)
})

test('decision_date is optional but must be ISO, real and not future', () => {
  assert.equal(validateDecisionInput({ ...VALID_DECISION, decision_date: '2025-06-01' }, { today: TODAY }).ok, true)
  for (const bad of ['01-06-2025', '2025-02-31', 'not-a-date', '2027-01-01']) {
    const result = validateDecisionInput({ ...VALID_DECISION, decision_date: bad }, { today: TODAY })
    assert.equal(result.ok, false, `${bad} must be rejected`)
    assert.ok(fields(result).includes('decision_date'))
  }
})

test('invalid categories and confidence levels are rejected', () => {
  for (const [field, value] of [
    ['category', 'Picking Lunch'],
    ['category', ''],
    ['confidence_level', 'Very Sure'],
  ]) {
    const result = validateDecisionInput({ ...VALID_DECISION, [field]: value }, { today: TODAY })
    assert.equal(result.ok, false)
    assert.ok(fields(result).includes(field))
  }
})

test('numeric rules: cost > 0 (ML schema), alternatives non-negative integer', () => {
  for (const cost of [0, -5, '1000', NaN, Infinity]) {
    const result = validateDecisionInput({ ...VALID_DECISION, estimated_cost_usd: cost }, { today: TODAY })
    assert.equal(result.ok, false, `cost ${cost} must be rejected`)
  }
  for (const alternatives of [-1, 2.5, 'three', 1001]) {
    const result = validateDecisionInput({ ...VALID_DECISION, num_alternatives: alternatives }, { today: TODAY })
    assert.equal(result.ok, false, `alternatives ${alternatives} must be rejected`)
  }
})

test('text minimums mirror the frontend form', () => {
  const result = validateDecisionInput(
    { ...VALID_DECISION, business_context: 'too short' },
    { today: TODAY },
  )
  assert.equal(result.ok, false)
  assert.ok(fields(result).includes('business_context'))
})

test('missing fields and unexpected fields are reported', () => {
  const missing = validateDecisionInput({ title: 'Valid title length' }, { today: TODAY })
  assert.equal(missing.ok, false)
  assert.ok(fields(missing).includes('category'))

  // Leakage guard: outcome/label/observation columns can never be submitted.
  const extra = validateDecisionInput(
    { ...VALID_DECISION, target_reversed: 1, decision_id: 'DRP-1' },
    { today: TODAY },
  )
  assert.equal(extra.ok, false)
  assert.ok(fields(extra).includes('target_reversed,decision_id'))
})

test('outcome: reversed and not_reversed require a valid date', () => {
  const base = { decisionDate: '2026-01-10', today: TODAY }
  assert.equal(validateOutcomeInput({ outcome: 'reversed', outcome_date: '2026-02-01' }, base).ok, true)
  assert.equal(validateOutcomeInput({ outcome: 'not_reversed', outcome_date: '2026-02-01' }, base).ok, true)

  const noDate = validateOutcomeInput({ outcome: 'reversed' }, base)
  assert.equal(noDate.ok, false)
  assert.ok(fields(noDate).includes('outcome_date'))
})

test('outcome: unknown is first-class and keeps the window open', () => {
  const base = { decisionDate: '2026-01-10', today: TODAY }
  const unknown = validateOutcomeInput({ outcome: 'unknown' }, base)
  assert.equal(unknown.ok, true)
  assert.equal(unknown.value.outcome_date, null, 'unknown outcome must not carry a date')
  assert.equal(unknown.value.outcome, 'unknown')

  const dated = validateOutcomeInput({ outcome: 'unknown', outcome_date: '2026-02-01' }, base)
  assert.equal(dated.ok, false, 'a date on an unknown outcome is inconsistent')
})

test('outcome dates cannot be future or before the decision', () => {
  const base = { decisionDate: '2026-01-10', today: TODAY }
  const future = validateOutcomeInput({ outcome: 'reversed', outcome_date: '2027-01-01' }, base)
  assert.equal(future.ok, false)
  const before = validateOutcomeInput({ outcome: 'reversed', outcome_date: '2025-12-31' }, base)
  assert.equal(before.ok, false)
})

test('outcome note optional but bounded; invalid outcome rejected', () => {
  const base = { decisionDate: '2026-01-10', today: TODAY }
  assert.equal(
    validateOutcomeInput({ outcome: 'unknown', note: ' '.repeat(10) }, base).value.note,
    null,
    'blank notes become null',
  )
  assert.equal(
    validateOutcomeInput({ outcome: 'unknown', note: 'x'.repeat(201) }, base).ok,
    false,
  )
  assert.equal(validateOutcomeInput({ outcome: 'maybe' }, base).ok, false)
})

test('parseId accepts digit ids only', () => {
  assert.equal(parseId('42'), '42')
  assert.equal(parseId('0007'), '0007')
  for (const bad of ['abc', '-1', '1 OR 1=1', '', undefined, '1.5', '12; DROP TABLE']) {
    assert.equal(parseId(bad), null, `${bad} must be rejected`)
  }
})

test('parsePagination defaults and bounds', () => {
  assert.deepEqual(parsePagination({}).value, { limit: 20, offset: 0 })
  assert.deepEqual(parsePagination({ limit: '5', offset: '10' }).value, { limit: 5, offset: 10 })
  for (const query of [{ limit: '0' }, { limit: '101' }, { limit: 'x' }, { offset: '-1' }]) {
    assert.equal(parsePagination(query).ok, false, `${JSON.stringify(query)} must be rejected`)
  }
})

test('todayIso produces a local ISO date', () => {
  assert.match(todayIso(new Date(2026, 0, 5)), /^2026-01-05$/)
})
