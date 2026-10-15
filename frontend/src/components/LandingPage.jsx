import { useState } from 'react'
import './LandingPage.css'

const FEATURES = [
  {
    title: 'Structured decision capture',
    description:
      'Record every decision with its business context, cost, alternatives, confidence level, expected benefits and risks — in one consistent format.',
    icon: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 3.5h6v3H9z" />
        <path d="M8.5 11h7M8.5 15h5" />
      </>
    ),
  },
  {
    title: 'Reversal-risk estimation',
    description:
      'The core idea: estimate how likely a decision is to be reversed in the future. The machine learning model is in development and not yet connected — no scores are produced today.',
    icon: (
      <>
        <path d="M12 4 3.5 19h17L12 4Z" />
        <path d="M12 10v4" />
        <circle cx="12" cy="16.6" r="0.4" fill="currentColor" />
      </>
    ),
  },
  {
    title: 'Historical decision log',
    description:
      'Keep a searchable history of past decisions and their outcomes — confirmed, pending or reversed — to build the record base that future analysis depends on.',
    icon: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
        <path d="M3 4.5V10h5.5" />
        <path d="M12 8v4.3l3 1.8" />
      </>
    ),
  },
  {
    title: 'Category-aware analysis',
    description:
      'Decisions are captured across hiring, supplier selection, project approvals, equipment purchases, product launches and technology selection.',
    icon: (
      <>
        <path d="M4 7h6v6H4zM14 7h6v6h-6zM9 15h6v6H9z" />
      </>
    ),
  },
  {
    title: 'Risk drivers in context',
    description:
      'Cost, number of alternatives and decision-maker confidence give the future model meaningful signals — and give reviewers a clear picture of each call.',
    icon: (
      <>
        <path d="M4 19h16" />
        <path d="M6.5 15.5 11 11l3 3 4.5-5.5" />
        <circle cx="6.5" cy="15.5" r="0.5" fill="currentColor" />
        <circle cx="18.5" cy="8.5" r="0.5" fill="currentColor" />
      </>
    ),
  },
  {
    title: 'Trend analytics',
    description:
      'Aggregated views of regret risk across categories and teams are planned, so patterns of costly reversals become visible before they repeat.',
    icon: (
      <>
        <path d="M3.5 20.5h17" />
        <rect x="4.5" y="11" width="3.2" height="7" rx="1" />
        <rect x="10.4" y="5.5" width="3.2" height="12.5" rx="1" />
        <rect x="16.3" y="14.5" width="3.2" height="3.5" rx="1" />
      </>
    ),
  },
]

const STEPS = [
  {
    title: 'Capture the decision',
    description:
      'Describe the decision, its financial cost, the alternatives you considered, your confidence and the expected benefits and risks.',
  },
  {
    title: 'Structure the record',
    description:
      'Your inputs become a structured decision record — the same consistent format used across categories and teams.',
  },
  {
    title: 'Estimate reversal risk',
    description:
      'Once the model is trained and connected, it will analyse the record against historical patterns and estimate the risk of a future reversal.',
  },
  {
    title: 'Learn from outcomes',
    description:
      'As decisions are confirmed or reversed, the historical record grows — closing the loop for continuously better estimates over time.',
  },
]

const BENEFITS = [
  {
    title: 'Earlier warning on risky calls',
    description: 'Surface decisions that carry a higher chance of being reversed — before commitments are made.',
  },
  {
    title: 'Consistent decision records',
    description: 'Every decision captured with the same structure, so reviews compare like with like.',
  },
  {
    title: 'Fewer costly reversals',
    description: 'Reducing avoidable reversals saves budget, time and the credibility of the teams involved.',
  },
  {
    title: 'Evidence over instinct',
    description: 'Give decision reviews a shared, data-driven basis instead of relying on gut feel alone.',
  },
]

function BrandMark() {
  return (
    <span className="landing__brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 16.5 9 10.5l4 4 8-8.5" />
        <path d="M15 6h6v6" />
      </svg>
    </span>
  )
}

function LandingPage({ onLogin, onGetStarted }) {
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="landing" id="top">
      <header className="landing__nav">
        <div className="landing__nav-inner">
          <a className="landing__brand" href="#top" onClick={closeMenu}>
            <BrandMark />
            <span className="landing__brand-name">
              Decision Regret <strong>Predictor</strong>
            </span>
          </a>

          <button
            type="button"
            className="landing__menu-btn"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <nav className={`landing__menu${menuOpen ? ' landing__menu--open' : ''}`} aria-label="Landing navigation">
            <div className="landing__menu-links">
              <a href="#top" onClick={closeMenu}>
                Home
              </a>
              <a href="#features" onClick={closeMenu}>
                Features
              </a>
              <a href="#how-it-works" onClick={closeMenu}>
                How It Works
              </a>
            </div>
            <div className="landing__menu-actions">
              <button
                type="button"
                className="landing__login-btn"
                onClick={() => {
                  closeMenu()
                  onLogin()
                }}
              >
                Log In
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  closeMenu()
                  onGetStarted()
                }}
              >
                Get Started
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="hero__inner">
            <div className="hero__content">
              <span className="hero__eyebrow">Decision intelligence for teams</span>
              <h1 className="hero__title">
                Estimate the risk of reversing a decision — <em>before</em> you commit.
              </h1>
              <p className="hero__subtitle">
                Decision Regret Predictor analyses your historical decision data with machine
                learning to estimate the risk that a decision will be reversed in the future —
                so your teams can act on evidence instead of instinct.
              </p>
              <div className="hero__actions">
                <button type="button" className="btn btn--primary btn--lg" onClick={onGetStarted}>
                  Get Started
                </button>
                <a className="btn btn--secondary btn--lg" href="#how-it-works">
                  See How It Works
                </a>
              </div>
              <p className="hero__disclaimer">
                Early-stage product — predictions are produced by an experimental model trained on
                a small synthetic dataset and are shown with its disclaimer. They are estimates,
                not evidence of accuracy.
              </p>
            </div>

            {/* Abstract interface preview (decorative, no scores or results) */}
            <div className="hero__preview" aria-hidden="true">
              <div className="hero-preview">
                <div className="hero-preview__chrome">
                  <span />
                  <span />
                  <span />
                  <em>Interface preview</em>
                </div>
                <div className="hero-preview__body">
                  <div className="hero-preview__row">
                    <div className="hero-preview__card">
                      <span className="skeleton skeleton--sm" />
                      <span className="skeleton skeleton--lg" />
                    </div>
                    <div className="hero-preview__card">
                      <span className="skeleton skeleton--sm" />
                      <span className="skeleton skeleton--lg" />
                    </div>
                  </div>
                  <div className="hero-preview__panel">
                    <span className="skeleton skeleton--md" />
                    <span className="skeleton" />
                    <span className="skeleton skeleton--short" />
                    <div className="hero-preview__status">
                      <span className="hero-preview__dot" />
                      Model not yet connected
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="section" id="features">
          <div className="section__inner">
            <div className="section__head">
              <span className="section__eyebrow">Features</span>
              <h2 className="section__title">Everything a regret-aware decision needs</h2>
              <p className="section__lead">
                A structured workflow for capturing decisions today — and the foundation for
                machine-learning risk estimates tomorrow.
              </p>
            </div>
            <div className="features-grid">
              {FEATURES.map((feature) => (
                <article className="feature-card" key={feature.title}>
                  <span className="feature-card__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {feature.icon}
                    </svg>
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="section section--alt" id="how-it-works">
          <div className="section__inner">
            <div className="section__head">
              <span className="section__eyebrow">How it works</span>
              <h2 className="section__title">From decision record to risk estimate</h2>
              <p className="section__lead">
                Four steps that turn everyday decisions into a dataset — and, once the model is
                connected, into reversal-risk estimates.
              </p>
            </div>
            <ol className="steps">
              {STEPS.map((step, index) => (
                <li className="step" key={step.title}>
                  <span className="step__number">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefits */}
        <section className="section" id="benefits">
          <div className="section__inner">
            <div className="section__head">
              <span className="section__eyebrow">Benefits</span>
              <h2 className="section__title">Why teams will care</h2>
            </div>
            <div className="benefits-grid">
              {BENEFITS.map((benefit) => (
                <article className="benefit" key={benefit.title}>
                  <span className="benefit__check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <div>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-band">
          <div className="cta-band__inner">
            <div>
              <h2>Capture your first decision in minutes</h2>
              <p>Start with the decision dashboard — no account or backend required for this preview.</p>
            </div>
            <button type="button" className="btn btn--light btn--lg" onClick={onGetStarted}>
              Get Started
            </button>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <div className="landing__footer-inner">
          <span className="landing__footer-brand">
            <BrandMark />
            Decision Regret Predictor
          </span>
          <nav aria-label="Footer navigation">
            <a href="#top">Home</a>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <button type="button" onClick={onLogin}>
              Log In
            </button>
          </nav>
          <p className="landing__footer-note">
            Concept build — not yet connected to a backend or a trained model. &copy; 2026 Decision
            Regret Predictor.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
