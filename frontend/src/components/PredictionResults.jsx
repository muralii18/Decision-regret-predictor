import { Fragment } from 'react'
import { formatIsoDate, formatPercent, formatUsd } from '../lib/display'
import './PredictionResults.css'

// Honest fallback: shown whenever real model output is missing. No score,
// probability, classification or factor is ever fabricated or taken from
// demo data.
function NotAvailable({ note }) {
  return (
    <div className="pr-na">
      <p className="pr-na__value">Not available yet</p>
      <p className="pr-na__note">{note}</p>
    </div>
  )
}

/**
 * Prediction Results.
 *
 * `decision` and `prediction` are the actual rows returned by the backend
 * (GET /api/decisions/:id and POST /api/decisions/:id/predictions). The
 * page renders exactly those fields — probability, predicted class/label,
 * dataset, threshold and the model's disclaimer — and never invents risk
 * levels, contributing factors, confidence intervals or accuracy claims.
 */
function PredictionResults({
  decision = null,
  prediction = null,
  busy = false,
  error = null,
  onGenerate = null,
  onViewHistory = null,
  onNewPrediction = null,
}) {
  const probability =
    prediction &&
    (formatPercent(prediction.probability_percent) ??
      formatPercent(
        typeof prediction.probability_of_reversal === 'number'
          ? prediction.probability_of_reversal * 100
          : null,
      ))

  const summary = decision
    ? [
        ['Decision ID', String(decision.id)],
        ['Title', decision.title],
        ['Decision date', formatIsoDate(decision.decision_date)],
        ['Category', decision.category],
        ['Estimated cost', formatUsd(decision.estimated_cost_usd)],
        ['Alternatives considered', String(decision.num_alternatives)],
        ['Confidence level', decision.confidence_level],
        ['Business context', decision.business_context],
        ['Expected benefits', decision.expected_benefits],
        ['Identified risks', decision.identified_risks],
      ]
    : null

  const noResultYet = !decision && !prediction

  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Prediction Results</h1>
          <p>
            The estimated probability that a submitted decision will be reversed, produced by the
            trained model and stored by the backend. Results are only ever shown when the prediction
            request succeeded.
          </p>
        </div>
        <div className="page-header__actions">
          {onViewHistory && (
            <button type="button" className="btn btn--secondary" onClick={onViewHistory}>
              Decision History
            </button>
          )}
          {onNewPrediction && (
            <button type="button" className="btn btn--primary" onClick={onNewPrediction}>
              New Prediction
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="app-alert app-alert--error" role="alert">
          {error}
        </p>
      )}

      {noResultYet ? (
        <section className="placeholder pr-empty" role="status" aria-labelledby="pr-empty-title">
          <h2 id="pr-empty-title">No prediction results yet</h2>
          <p>
            Submit a decision with the New Prediction form first — its result will appear here once
            a prediction request has succeeded. You can also open a saved decision from the Decision
            History view.
          </p>
          <div className="pr-empty__actions">
            {onNewPrediction && (
              <button type="button" className="btn btn--primary pr-empty__cta" onClick={onNewPrediction}>
                Go to New Prediction
              </button>
            )}
            {onViewHistory && (
              <button type="button" className="btn btn--secondary pr-empty__cta" onClick={onViewHistory}>
                Open Decision History
              </button>
            )}
          </div>
        </section>
      ) : null}

      {!prediction && decision && (
        <section className="placeholder pr-empty" role="status" aria-labelledby="pr-none-title">
          <h2 id="pr-none-title">No prediction saved for this decision</h2>
          <p>
            Decision&nbsp;#{decision.id} (“{decision.title}”) is saved, but no prediction has been
            generated for it yet{error ? '.' : '.'} Generate one now with the trained model, or
            return to the history view.
          </p>
          {busy && (
            <p className="pr-status" role="status">
              Generating prediction…
            </p>
          )}
          <div className="pr-empty__actions">
            {onGenerate && (
              <button
                type="button"
                className="btn btn--primary pr-empty__cta"
                onClick={onGenerate}
                disabled={busy}
              >
                {busy ? 'Generating…' : 'Generate prediction'}
              </button>
            )}
            {onViewHistory && (
              <button type="button" className="btn btn--secondary pr-empty__cta" onClick={onViewHistory}>
                Back to History
              </button>
            )}
          </div>
        </section>
      )}

      <div className="pr-sections">
        <div className="pr-grid">
          <section className="panel pr-panel" aria-label="Estimated probability of reversal">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Estimated probability of reversal</h2>
                <p className="panel__subtitle">
                  How likely the decision is to be reversed, as returned by the model.
                </p>
              </div>
            </div>
            <div className="pr-panel__body">
              {probability ? (
                <>
                  <p className="pr-value">{probability}</p>
                  <p className="pr-meta">
                    {prediction.probability_of_reversal !== undefined && (
                      <span>P(model class 1) = {prediction.probability_of_reversal}</span>
                    )}
                    {prediction.dataset && <span>Dataset: {prediction.dataset}</span>}
                    {prediction.threshold !== undefined && (
                      <span>Threshold: {prediction.threshold}</span>
                    )}
                  </p>
                </>
              ) : (
                <NotAvailable note="Only the trained model can produce this estimate. No demo or placeholder value is ever shown here." />
              )}
            </div>
          </section>

          <section className="panel pr-panel" aria-label="Predicted class">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Predicted class</h2>
                <p className="panel__subtitle">
                  The model's binary output at its own threshold — not a risk level or
                  recommendation.
                </p>
              </div>
            </div>
            <div className="pr-panel__body">
              {prediction?.predicted_label ? (
                <>
                  <p className="pr-value">{prediction.predicted_label}</p>
                  <p className="pr-meta">
                    {prediction.predicted_class !== undefined && (
                      <span>Class {prediction.predicted_class}</span>
                    )}
                    <span>Model output only — no risk classification is computed by this app</span>
                  </p>
                </>
              ) : (
                <NotAvailable note="The label comes directly from the trained model's output. This page never assigns a risk level using arbitrary thresholds." />
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
            <NotAvailable note="The model API returns only a probability and a predicted class — no explainability output (for example SHAP values) exists, so no factors are listed and none are invented." />
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
            {summary ? (
              <dl className="pr-summary">
                {summary.map(([term, value]) => (
                  <Fragment key={term}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              </dl>
            ) : (
              <NotAvailable note="The relevant details of the submitted decision will be displayed here when a result is available." />
            )}
          </div>
        </section>

        <section className="panel pr-panel" aria-label="Model disclaimer">
          <div className="panel__header">
            <div>
              <h2 className="panel__title">Model disclaimer</h2>
              <p className="panel__subtitle">
                Returned verbatim by the backend from the prediction response.
              </p>
            </div>
          </div>
          <div className="pr-panel__body">
            {prediction?.disclaimer ? (
              <blockquote className="pr-disclaimer">{prediction.disclaimer}</blockquote>
            ) : (
              <NotAvailable note="The disclaimer is part of the prediction response and appears here once a prediction has been generated." />
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
                Results come from a model trained on a small synthetic dataset that may not reflect
                this specific decision.
              </li>
              <li>
                The predicted class is a model output; it is not a decision rule or professional
                advice, and no risk level or explanation is provided.
              </li>
              <li>No result exists unless a prediction request succeeded — demo values are never presented as predictions.</li>
            </ul>
          </div>
        </section>
      </div>
    </>
  )
}

export default PredictionResults
