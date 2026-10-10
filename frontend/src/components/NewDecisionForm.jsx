import { useState } from 'react'
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

// Per-field validation — returns a clear, user-facing message or ''.
function validateField(name, value) {
  const trimmed = typeof value === 'string' ? value.trim() : value

  switch (name) {
    case 'title':
      if (!trimmed) return 'Decision title is required.'
      if (trimmed.length < 3) return 'Decision title must be at least 3 characters.'
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
      if (Number.isNaN(cost) || cost < 0) return 'Enter a valid cost of 0 or greater.'
      return ''
    }
    case 'alternatives': {
      if (!trimmed) return 'Number of alternatives considered is required.'
      const count = Number(trimmed)
      if (!Number.isInteger(count) || count < 0) return 'Enter a whole number of 0 or greater.'
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

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function FieldError({ id, message }) {
  if (!message) return null
  return (
    <p className="field__error" id={id} role="alert">
      {message}
    </p>
  )
}

function ConfirmationView({ decision, onBackToDashboard, onCaptureAnother }) {
  const rows = [
    ['Decision title', decision.title],
    ['Category', decision.category],
    ['Description & business context', decision.description],
    ['Estimated financial cost', formatCurrency(decision.cost)],
    ['Alternatives considered', decision.alternatives],
    ['Confidence level', decision.confidence],
    ['Expected benefits', decision.benefits],
    ['Main risks identified', decision.risks],
  ]

  return (
    <section className="panel confirmation">
      <div className="confirmation__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h2 className="confirmation__title">Decision details captured</h2>
      <p className="confirmation__text">
        Your decision has been captured in this session. The details below are exactly what you
        submitted.
      </p>
      <p className="confirmation__note">
        No prediction has been generated. Regret-risk analysis will be available once the backend
        and machine learning model are connected in a later step.
      </p>

      <dl className="confirmation__summary">
        {rows.map(([label, value]) => (
          <div className="confirmation__row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="form-actions">
        <button type="button" className="btn btn--primary" onClick={onBackToDashboard}>
          Back to Dashboard
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCaptureAnother}>
          Capture Another Decision
        </button>
      </div>
    </section>
  )
}

function NewDecisionForm({ onCancel }) {
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [capturedDecision, setCapturedDecision] = useState(null)

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (submitAttempted) {
      setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }))
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
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

    setCapturedDecision({ ...formData })
  }

  function resetForm() {
    setFormData(EMPTY_FORM)
    setErrors({})
    setSubmitAttempted(false)
    setCapturedDecision(null)
  }

  if (capturedDecision) {
    return (
      <>
        <div className="page-header">
          <div className="page-header__text">
            <h1>New Decision</h1>
            <p>Capture a decision for regret analysis.</p>
          </div>
        </div>
        <ConfirmationView
          decision={capturedDecision}
          onBackToDashboard={onCancel}
          onCaptureAnother={resetForm}
        />
      </>
    )
  }

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
            <p className="panel__subtitle">Stored in this session only — no backend connected yet.</p>
          </div>
        </div>

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
                  min="0"
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

          <div className="form-actions">
            <button type="submit" className="btn btn--primary">
              Submit
            </button>
            <button type="button" className="btn btn--secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </>
  )
}

export default NewDecisionForm
