import './SummaryCards.css'

// Card icons (shared across sources).
const ICONS = {
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3.5h6v3H9z" />
      <path d="M8.5 11h7M8.5 15h5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.6" r="0.4" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4.5V10h5.5" />
      <path d="M12 8.5v4l2.8 1.7" />
    </>
  ),
  trend: (
    <>
      <path d="M4 19h16" />
      <path d="M6.5 15.5 11 11l3 3 4.5-5.5" />
      <circle cx="6.5" cy="15.5" r="0.5" fill="currentColor" />
      <circle cx="11" cy="11" r="0.5" fill="currentColor" />
      <circle cx="14" cy="14" r="0.5" fill="currentColor" />
      <circle cx="18.5" cy="8.5" r="0.5" fill="currentColor" />
    </>
  ),
}

// Counts computed over a partial page are shown with a trailing '+'.
function countLabel(value, exact) {
  if (typeof value !== 'number') return '—'
  return exact ? String(value) : `${value}+`
}

/**
 * Card templates per source. The `live` template is computed from backend
 * data; the `demo` template exists only for illustrative sample layouts.
 * Every card carries an explicit source chip and hint so a live value and an
 * illustrative value can never be confused — and demo values are never
 * labelled as model predictions.
 */
const CARD_TEMPLATES = {
  live: [
    {
      id: 'total',
      label: 'Total Decisions',
      value: (s) => countLabel(s.totalDecisions, true),
      hint: 'Saved in PostgreSQL (live)',
      tone: 'indigo',
      icon: ICONS.clipboard,
    },
    {
      id: 'outcomes-recorded',
      label: 'Outcomes Recorded',
      value: (s) => countLabel(s.outcomesRecorded, s.countsExact),
      hint: 'Actual outcomes captured (live)',
      tone: 'violet',
      icon: ICONS.trend,
    },
    {
      id: 'reversed',
      label: 'Reversed Decisions',
      value: (s) => countLabel(s.reversedDecisions, s.countsExact),
      hint: 'Recorded outcome = reversed (live)',
      tone: 'danger',
      icon: ICONS.warning,
    },
    {
      id: 'awaiting',
      label: 'Awaiting Outcome',
      value: (s) => countLabel(s.awaitingOutcome, s.countsExact),
      hint: 'No outcome recorded yet (live)',
      tone: 'warning',
      icon: ICONS.clock,
    },
  ],
  demo: [
    {
      id: 'total',
      label: 'Total Decisions',
      value: (s) => s.totalDecisions,
      hint: 'Illustrative demo dataset — not saved data',
      tone: 'indigo',
      icon: ICONS.clipboard,
    },
    {
      id: 'high-risk',
      label: 'High-Risk Decisions',
      value: (s) => s.highRiskDecisions,
      hint: 'Demo score ≥ 70 — not a model prediction',
      tone: 'danger',
      icon: ICONS.warning,
    },
    {
      id: 'reversed',
      label: 'Reversed Decisions',
      value: (s) => s.reversedDecisions,
      hint: 'Illustrative demo status',
      tone: 'warning',
      icon: ICONS.clock,
    },
    {
      id: 'avg-risk',
      label: 'Average Regret Risk',
      value: (s) => `${s.averageRegretRisk}%`,
      hint: 'Mean demo score — not a model prediction',
      tone: 'violet',
      icon: ICONS.trend,
    },
  ],
}

function SummaryCards({ stats, source = 'demo' }) {
  const cards = CARD_TEMPLATES[source] ?? CARD_TEMPLATES.demo
  const chip = source === 'live' ? 'Live' : 'Demo'

  return (
    <section className="summary-cards" aria-label="Decision summary metrics">
      {cards.map((card) => (
        <article key={card.id} className={`summary-card summary-card--${card.tone}`}>
          <div className="summary-card__head">
            <span className="summary-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {card.icon}
              </svg>
            </span>
            <h3 className="summary-card__label">{card.label}</h3>
            <span className={`summary-card__chip summary-card__chip--${source}`}>{chip}</span>
          </div>
          <p className="summary-card__value">{card.value(stats)}</p>
          <p className="summary-card__hint">{card.hint}</p>
        </article>
      ))}
    </section>
  )
}

export default SummaryCards
