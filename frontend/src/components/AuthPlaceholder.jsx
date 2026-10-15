import './AuthPlaceholder.css'

const AUTH_COPY = {
  login: {
    title: 'Log In',
    subtitle: 'Welcome back to Decision Regret Predictor.',
    fields: [
      { id: 'auth-email', label: 'Email address', type: 'email', placeholder: 'you@company.com' },
      { id: 'auth-password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ],
    submitLabel: 'Log In — coming soon',
    switchNote: 'No account yet? Get Started from the home page.',
  },
  register: {
    title: 'Create your account',
    subtitle: 'Start capturing decisions with Decision Regret Predictor.',
    fields: [
      { id: 'auth-name', label: 'Full name', type: 'text', placeholder: 'Jane Doe' },
      { id: 'auth-email', label: 'Work email', type: 'email', placeholder: 'you@company.com' },
      { id: 'auth-password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ],
    submitLabel: 'Create account — coming soon',
    switchNote: 'Already registered? Use Log In from the home page.',
  },
}

function AuthPlaceholder({ mode, onBack, onEnterApp }) {
  const copy = AUTH_COPY[mode]

  return (
    <div className="auth-page">
      <header className="auth-page__nav">
        <button type="button" className="auth-page__brand" onClick={onBack}>
          <span className="auth-page__brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 16.5 9 10.5l4 4 8-8.5" />
              <path d="M15 6h6v6" />
            </svg>
          </span>
          Decision Regret Predictor
        </button>
        <button type="button" className="auth-page__back" onClick={onBack}>
          ← Back to Home
        </button>
      </header>

      <main className="auth-page__main">
        <section className="auth-card" aria-labelledby="auth-card-title">
          <div className="auth-card__banner" role="note">
            <strong>Placeholder screen</strong>
            Authentication is not implemented yet — no account is created and no data is sent
            anywhere.
          </div>

          <h1 id="auth-card-title">{copy.title}</h1>
          <p className="auth-card__subtitle">{copy.subtitle}</p>

          <form className="auth-card__form" onSubmit={(event) => event.preventDefault()} noValidate>
            {copy.fields.map((field) => (
              <div className="auth-card__field" key={field.id}>
                <label htmlFor={field.id}>{field.label}</label>
                <input
                  id={field.id}
                  type={field.type}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  disabled
                />
              </div>
            ))}
            <button type="button" className="btn btn--primary auth-card__submit" disabled>
              {copy.submitLabel}
            </button>
          </form>

          <p className="auth-card__note">{copy.switchNote}</p>

          <div className="auth-card__divider" aria-hidden="true">
            <span>Preview only</span>
          </div>

          <button type="button" className="btn btn--secondary auth-card__demo" onClick={onEnterApp}>
            Continue to the demo dashboard
          </button>
          <p className="auth-card__hint">
            The dashboard and New Prediction form run locally against your own backend &mdash; no
            sign-in is implemented yet.
          </p>
        </section>
      </main>
    </div>
  )
}

export default AuthPlaceholder
