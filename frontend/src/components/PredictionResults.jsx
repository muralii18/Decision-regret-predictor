import { Fragment } from 'react'
import './PredictionResults.css'

// Honest fallback: shown whenever real model output is missing. No score,
// probability, classification or factor is ever fabricated or taken from demo data.
function NotAvailable({ note }) {
  return (
    <div className="pr-na">
      <p className="pr-na__value">Not available yet</p>
      <p className="pr-na__note">{note}</p>
    </div>
  )
}

// Optional `result` is the shape a future backend/model response will provide:
//   { probability: 0-1, classification: string,
//     factors: [{ label, detail }], decision: [{ term, value }] }
// Until such a result exists, every area renders "Not available yet".
function PredictionResults({ result = null, onSubmitPrediction }) {
  const probability =
    typeof result?.probability === 'number' && Number.isFinite(result.probability)
      ? `${(result.probability * 100).toFixed(1)}%`
      : null
  const classification = result?.classification || null
  const factors =
    Array.isArray(result?.factors) && result.factors.length > 0 ? result.factors : null
  const decision =
    Array.isArray(result?.decision) && result.decision.length > 0 ? result.decision : null

  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Prediction Results</h1>
          <p>
            Review the estimated probability that a submitted decision will be reversed, its risk
            classification, and the factors behind it. Results are produced only by the trained
            model — never by demo data.
          </p>
        </div>
      </div>

      {!result && (
        <section className="placeholder pr-empty" role="status" aria-labelledby="pr-empty-title">
          <h2 id="pr-empty-title">No prediction results yet</h2>
          <p>
            Submit a decision with the New Prediction form first — its result will appear here once
            a prediction has been generated. The model is still in development, so there is nothing
            to display yet.
          </p>
          <button
            type="button"
            className="btn btn--primary pr-empty__cta"
            onClick={onSubmitPrediction}
          >
            Go to New Prediction
          </button>
        </section>
      )}

      <div className="pr-sections">
        <div className="pr-grid">
          <section className="panel pr-panel" aria-label="Estimated probability of reversal">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Estimated probability of reversal</h2>
                <p className="panel__subtitle">
                  How likely the decision is to be reversed within its observation window.
                </p>
              </div>
            </div>
            <div className="pr-panel__body">
              {probability ? (
                <p className="pr-value">{probability}</p>
              ) : (
                <NotAvailable note="Only the trained model can produce this estimate. No demo or placeholder value is ever shown here." />
              )}
            </div>
          </section>

          <section className="panel pr-panel" aria-label="Risk classification">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Risk classification</h2>
                <p className="panel__subtitle">
                  Overall risk level communicated with the prediction.
                </p>
              </div>
            </div>
            <div className="pr-panel__body">
              {classification ? (
                <p className="pr-value">{classification}</p>
              ) : (
                <NotAvailable note="The classification will come directly from the trained model's output. This page never assigns a risk level using arbitrary thresholds." />
              )}
            </div>
          </section>
        </div>

        <section className="panel pr-panel" aria-label="Contributing factors">
          <div className="panel__header">
            <div>
              <h2 className="panel__title">Contributing factors</h2>
              <p className="panel__subtitle">What drove this prediction.</p>
            </div>
          </div>
          <div className="pr-panel__body">
            {factors ? (
              <ul className="pr-factors">
                {factors.map((factor) => (
                  <li key={factor.label} className="pr-factor">
                    <span className="pr-factor__label">{factor.label}</span>
                    {factor.detail && (
                      <span className="pr-factor__detail">{factor.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <NotAvailable note="Contributing factors must come from the trained model or its explainability output (for example, SHAP values). Until that output exists, no factors are listed." />
            )}
          </div>
        </section>

        <section className="panel pr-panel" aria-label="Decision summary">
          <div className="panel__header">
            <div>
              <h2 className="panel__title">Decision summary</h2>
              <p className="panel__subtitle">The decision details this result refers to.</p>
            </div>
          </div>
          <div className="pr-panel__body">
            {decision ? (
              <dl className="pr-summary">
                {decision.map((item) => (
                  <Fragment key={item.term}>
                    <dt>{item.term}</dt>
                    <dd>{item.value}</dd>
                  </Fragment>
                ))}
              </dl>
            ) : (
              <NotAvailable note="The relevant details of the submitted decision will be displayed here when a result is available." />
            )}
          </div>
        </section>

        <section className="panel pr-panel" aria-label="Limitations">
          <div className="panel__header">
            <div>
              <h2 className="panel__title">Limitations</h2>
              <p className="panel__subtitle">How to interpret a prediction responsibly.</p>
            </div>
          </div>
          <div className="pr-panel__body">
            <ul className="pr-limitations__list">
              <li>
                A probability is an estimate, not a guarantee — the actual outcome can still
                differ.
              </li>
              <li>
                Results come from a model trained on historical data that may not reflect this
                specific decision.
              </li>
              <li>
                A risk classification communicates the estimate; it is not a decision rule or
                professional advice.
              </li>
              <li>
                No result exists until the backend and trained model are connected. Demo values are
                never presented as predictions.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </>
  )
}

export default PredictionResults
