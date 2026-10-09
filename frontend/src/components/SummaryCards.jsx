import './SummaryCards.css'

function SummaryCards({ stats }) {
  const cards = [
    {
      id: 'total',
      label: 'Total Decisions',
      value: stats.totalDecisions,
      hint: 'Recorded in demo dataset',
      tone: 'indigo',
      icon: (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 3.5h6v3H9z" />
          <path d="M8.5 11h7M8.5 15h5" />
        </>
      ),
    },
    {
      id: 'high-risk',
      label: 'High-Risk Decisions',
      value: stats.highRiskDecisions,
      hint: 'Risk score 70 or above',
      tone: 'danger',
      icon: (
        <>
          <path d="M12 4 3.5 19h17L12 4Z" />
          <path d="M12 10v4" />
          <circle cx="12" cy="16.6" r="0.4" fill="currentColor" />
        </>
      ),
    },
    {
      id: 'reversed',
      label: 'Reversed Decisions',
      value: stats.reversedDecisions,
      hint: 'Flagged as regretted',
      tone: 'warning',
      icon: (
        <>
          <path d="M4 12a8 8 0 1 0 2.4-5.7" />
          <path d="M4 4.5V10h5.5" />
          <path d="M12 8.5v4l2.8 1.7" />
        </>
      ),
    },
    {
      id: 'avg-risk',
      label: 'Average Regret Risk',
      value: `${stats.averageRegretRisk}%`,
      hint: 'Mean score across decisions',
      tone: 'violet',
      icon: (
        <>
          <path d="M4 19h16" />
          <path d="M6.5 15.5 11 11l3 3 4.5-5.5" />
          <circle cx="6.5" cy="15.5" r="0.5" fill="currentColor" />
          <circle cx="11" cy="11" r="0.5" fill="currentColor" />
          <circle cx="14" cy="14" r="0.5" fill="currentColor" />
          <circle cx="18.5" cy="8.5" r="0.5" fill="currentColor" />
        </>
      ),
    },
  ]

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
          </div>
          <p className="summary-card__value">{card.value}</p>
          <p className="summary-card__hint">{card.hint}</p>
        </article>
      ))}
    </section>
  )
}

export default SummaryCards
