import { useRef, useState } from 'react'
import { createDecision, createPrediction, toDecisionPayload } from '../lib/api'
import './NewDecisionForm.css'

const CATEGORY_OPTIONS = [
  'Hiring',
  'Supplier Selection',
  'Project Approval',
  'Equipment Purchase',
  'Product Launch',
  'Technology Selection',
]

const CONFIDENCE_OPTIONS = ['Low', 'Medium', 'High']

const EMPTY_FORM = {
  title: '',
  category: '',
  description: '',
  cost: '',
  alternatives: '',
  confidence: '',
  benefits: '',
  risks: '',
}

// Backend field name -> form field name, for mapping API `details` errors.
const API_FIELD_TO_FORM = {
  title: 'title',
  category: 'category',
  estimated_cost_usd: 'cost',
  num_alternatives: 'alternatives',
  confidence_level: 'confidence',
  business_context: 'description',
  expected_benefits: 'benefits',
  identified_risks: 'risks',
}

// Per-field validation — mirrors the backend rules
// (backend/src/validation/validate.js) so problems are caught before a
// request is made. Returns a clear, user-facing message or ''.
function validateField(name, value) {
  const trimmed = typeof value === 'string' ? value.trim() : value

  switch (name) {
    case 'title':
      if (!trimmed) return 'Decision title is required.'
      if (trimmed.length < 3) return 'Decision title must be at least 3 characters.'
      if (trimmed.length > 200) return 'Decision title must be at most 200 characters.'
      return ''
    case 'category':
      if (!trimmed) return 'Please select a decision category.'
      return ''
    case 'description':
      if (!trimmed) return 'Description and business context are required.'
      if (trimmed.length < 10) return 'Please provide at least 10 characters of business context.'
      return ''
    case 'cost': {
      if (!trimmed) return 'Estimated financial cost is required.'
      const cost = Number(trimmed)
      if (Number.isNaN(cost) || cost <= 0) return 'Enter a cost greater than 0.'
      return ''
    }
    case 'alternatives': {
      if (!trimmed) return 'Number of alternatives considered is required.'
      const count = Number(trimmed)
      if (!Number.isInteger(count) || count < 0 || count > 1000) {
        return 'Enter a whole number between 0 and 1000.'
      }
      return ''
    }
    case 'confidence':
      if (!trimmed) return 'Please select your confidence level.'
      return ''
    case 'benefits':
      if (!trimmed) return 'Expected benefits are required.'
      if (trimmed.length < 10) return 'Please describe the expected benefits in at least 10 characters.'
      return ''
    case 'risks':
      if (!trimmed) return 'Main risks identified are required.'
      if (trimmed.length < 10) return 'Please describe the main risks in at least 10 characters.'
      return ''
    default:
      return ''
  }
}

function FieldError({ id, message }) {
  if (!message) return null
  return (
    <p className="field__error" id={id} role="alert">
      {message}
    </p>
  )
}

/**
 * Shown when the decision was saved but the prediction request failed:
 * the saved decision is preserved (no duplicate is ever created) and the
 * server's explanation is displayed verbatim.
 */
function SavedWithoutPrediction({ decision, errorMessage, busy, onRetry, onBackToDashboard, onViewHistory }) {
  const rows = [
    ['Decision ID', decision.id],
    ['Decision title', decision.title],
    ['Category', decision.category],
    ['Decision date', decision.decision_date],
    ['Estimated financial cost', Number(decision.estimated_cost_usd).toLocaleString('en-US', { style: 'currency', currency: 'USD' })],
    ['Alternatives considered', String(decision.num_alternatives)],
    ['Confidence level', decision.confidence_level],
    ['Description & business context', decision.business_context],
    ['Expected benefits', decision.expected_benefits],
    ['Main risks identified', decision.identified_risks],
  ]

  return (
    <section className="panel confirmation" role="alert">
      <div className="confirmation__icon confirmation__icon--warning" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <h2 className="confirmation__title">Decision saved — prediction unavailable</h2>
      <p className="confirmation__text">
        Your decision was saved to the database with ID&nbsp;<strong>{decision.id}</strong>.
        The prediction could not be generated, so <strong>no prediction is shown and none was
        saved</strong>.
      </p>
      <p className="confirmation__note">{errorMessage}</p>

      <dl className="confirmation__summary">
        {rows.map(([label, value]) => (
          <div className="confirmation__row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="form-actions">
        <button type="button" className="btn btn--primary" onClick={onRetry} disabled={busy}>
          {busy ? 'Retrying…' : 'Retry prediction'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onViewHistory}>
          View in History
        </button>
        <button type="button" className="btn btn--secondary" onClick={onBackToDashboard}>
          Back to Dashboard
        </button>
      </div>
    </section>
  )
}

function NewDecisionForm({ onCancel, onViewHistory, onPredictionReady }) {
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [formError, setFormError] = useState(null)
  const [phase, setPhase] = useState('editing') // 'editing' | 'submitting'
  const [savedDecision, setSavedDecision] = useState(null)
  const [predictionError, setPredictionError] = useState(null)
  const [retrying, setRetrying] = useState(false)
  // Synchronous in-flight guard: state alone cannot stop a double click in
  // the same tick from firing two requests.
  const inFlight = useRef(false)

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (submitAttempted) {
      setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }))
    }
  }

  function applyApiError(error) {
    if (Array.isArray(error?.details) && error.details.length > 0) {
      const fieldErrors = {}
      const unmapped = []
      for (const detail of error.details) {
        const formField = API_FIELD_TO_FORM[detail.field]
        if (formField) fieldErrors[formField] = detail.message
        else unmapped.push(detail.message)
      }
      setErrors((prev) => ({ ...prev, ...fieldErrors }))
      setFormError(unmapped.length > 0 ? unmapped.join(' ') : null)
    } else {
      setFormError(error?.message ?? 'The request failed. Please try again.')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current) return
    setSubmitAttempted(true)

    const nextErrors = {}
    for (const key of Object.keys(EMPTY_FORM)) {
      const message = validateField(key, formData[key])
      if (message) nextErrors[key] = message
    }
    setErrors(nextErrors)

    const firstInvalid = Object.keys(EMPTY_FORM).find((key) => nextErrors[key])
    if (firstInvalid) {
      const target =
        firstInvalid === 'confidence'
          ? document.querySelector('input[name="confidence"]')
          : document.getElementById(`nd-${firstInvalid}`)
      if (target) target.focus()
      return
    }

    inFlight.current = true
    setFormError(null)
    setPhase('submitting')

    let decision = null
    try {
      // 1. Save the decision; the returned id is used for the prediction.
      decision = await createDecision(toDecisionPayload(formData))
    } catch (error) {
      applyApiError(error)
      setPhase('editing')
      inFlight.current = false
      return
    }

    // 2. Request a prediction for the saved decision. On failure the saved
    //    decision is kept and no duplicate create is attempted.
    try {
      const prediction = await createPrediction(decision.id)
      inFlight.current = false
      onPredictionReady(decision, prediction)
    } catch (error) {
      setSavedDecision(decision)
      setPredictionError(error?.message ?? 'The prediction request failed.')
      setPhase('editing')
      inFlight.current = false
    }
  }

  async function handleRetryPrediction() {
    if (inFlight.current || !savedDecision) return
    inFlight.current = true
    setRetrying(true)
    setPredictionError(null)
    try {
      const prediction = await createPrediction(savedDecision.id)
      inFlight.current = false
      setRetrying(false)
      onPredictionReady(savedDecision, prediction)
    } catch (error) {
      setPredictionError(error?.message ?? 'The prediction request failed.')
      setRetrying(false)
      inFlight.current = false
    }
  }

  if (savedDecision) {
    return (
      <>
        <div className="page-header">
          <div className="page-header__text">
            <h1>New Decision</h1>
            <p>Capture a decision for regret analysis.</p>
          </div>
        </div>
        <SavedWithoutPrediction
          decision={savedDecision}
          errorMessage={predictionError}
          busy={retrying}
          onRetry={handleRetryPrediction}
          onBackToDashboard={onCancel}
          onViewHistory={onViewHistory}
        />
      </>
    )
  }

  const submitting = phase === 'submitting'

  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>New Decision</h1>
          <p>Capture a decision for regret analysis. Fields marked * are required.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h3 className="panel__title">Decision Details</h3>
            <p className="panel__subtitle">
              Saved to the backend, then scored by the trained ML model.
            </p>
          </div>
        </div>

        {formError && (
          <p className="app-alert app-alert--error" role="alert">
            {formError}
          </p>
        )}

        <form className="decision-form" onSubmit={handleSubmit} noValidate>
          <div className="decision-form__grid">
            <div className="field field--full">
              <label htmlFor="nd-title">
                Decision title <span className="field__required" aria-hidden="true">*</span>
              </label>
              <input
                type="text"
                id="nd-title"
                name="title"
                maxLength="200"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. Approve Q4 supplier contract renewal"
                aria-required="true"
                aria-invalid={errors.title ? 'true' : undefined}
                aria-describedby={errors.title ? 'nd-title-error' : undefined}
              />
              <FieldError id="nd-title-error" message={errors.title} />
            </div>

            <div className="field">
              <label htmlFor="nd-category">
                Decision category <span className="field__required" aria-hidden="true">*</span>
              </label>
              <select
                id="nd-category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                aria-required="true"
                aria-invalid={errors.category ? 'true' : undefined}
                aria-describedby={errors.category ? 'nd-category-error' : undefined}
              >
                <option value="">Select a category…</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <FieldError id="nd-category-error" message={errors.category} />
            </div>

            <div className="field">
              <label htmlFor="nd-cost">
                Estimated financial cost (USD){' '}
                <span className="field__required" aria-hidden="true">*</span>
              </label>
              <div className="field__input-group">
                <span className="field__prefix" aria-hidden="true">
                  $
                </span>
                <input
                  type="number"
                  id="nd-cost"
                  name="cost"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.cost}
                  onChange={handleChange}
                  placeholder="0.00"
                  aria-required="true"
                  aria-invalid={errors.cost ? 'true' : undefined}
                  aria-describedby={errors.cost ? 'nd-cost-error' : undefined}
                />
              </div>
              <FieldError id="nd-cost-error" message={errors.cost} />
            </div>

            <div className="field">
              <label htmlFor="nd-alternatives">
                Number of alternatives considered{' '}
                <span className="field__required" aria-hidden="true">*</span>
              </label>
              <input
                type="number"
                id="nd-alternatives"
                name="alternatives"
                min="0"
                max="1000"
                step="1"
                inputMode="numeric"
                value={formData.alternatives}
                onChange={handleChange}
                placeholder="e.g. 3"
                aria-required="true"
                aria-invalid={errors.alternatives ? 'true' : undefined}
                aria-describedby={errors.alternatives ? 'nd-alternatives-error' : undefined}
              />
              <FieldError id="nd-alternatives-error" message={errors.alternatives} />
            </div>

            <div className="field">
              <fieldset
                className="field__group"
                aria-invalid={errors.confidence ? 'true' : undefined}
                aria-describedby={errors.confidence ? 'nd-confidence-error' : undefined}
              >
                <legend>
                  Confidence level of the decision maker{' '}
                  <span className="field__required" aria-hidden="true">*</span>
                </legend>
                <div className="confidence-options">
                  {CONFIDENCE_OPTIONS.map((option) => (
                    <label className="confidence-option" key={option} htmlFor={`nd-confidence-${option}`}>
                      <input
                        type="radio"
                        id={`nd-confidence-${option}`}
                        name="confidence"
                        value={option}
                        checked={formData.confidence === option}
                        onChange={handleChange}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <FieldError id="nd-confidence-error" message={errors.confidence} />
            </div>

            <div className="field field--full">
              <label htmlFor="nd-description">
                Description and business context{' '}
                <span className="field__required" aria-hidden="true">*</span>
              </label>
              <textarea
                id="nd-description"
                name="description"
                rows="4"
                maxLength="5000"
                value={formData.description}
                onChange={handleChange}
                placeholder="What is being decided, and why does it matter to the business?"
                aria-required="true"
                aria-invalid={errors.description ? 'true' : undefined}
                aria-describedby={errors.description ? 'nd-description-error' : undefined}
              />
              <FieldError id="nd-description-error" message={errors.description} />
            </div>

            <div className="field field--full">
              <label htmlFor="nd-benefits">
                Expected benefits <span className="field__required" aria-hidden="true">*</span>
              </label>
              <textarea
                id="nd-benefits"
                name="benefits"
                rows="3"
                maxLength="5000"
                value={formData.benefits}
                onChange={handleChange}
                placeholder="What positive outcomes do you expect if this decision succeeds?"
                aria-required="true"
                aria-invalid={errors.benefits ? 'true' : undefined}
                aria-describedby={errors.benefits ? 'nd-benefits-error' : undefined}
              />
              <FieldError id="nd-benefits-error" message={errors.benefits} />
            </div>

            <div className="field field--full">
              <label htmlFor="nd-risks">
                Main risks identified <span className="field__required" aria-hidden="true">*</span>
              </label>
              <textarea
                id="nd-risks"
                name="risks"
                rows="3"
                maxLength="5000"
                value={formData.risks}
                onChange={handleChange}
                placeholder="What could go wrong, and how severe would it be?"
                aria-required="true"
                aria-invalid={errors.risks ? 'true' : undefined}
                aria-describedby={errors.risks ? 'nd-risks-error' : undefined}
              />
              <FieldError id="nd-risks-error" message={errors.risks} />
            </div>
          </div>

          {submitting && (
            <p className="form-status" role="status">
              Saving your decision and requesting a prediction from the ML model…
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </>
  )
}

export default NewDecisionForm
