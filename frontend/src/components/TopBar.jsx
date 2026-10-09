import { DEMO_USER } from '../data/demoData'
import './TopBar.css'

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  'new-prediction': 'New Prediction',
  history: 'Decision History',
  analytics: 'Analytics',
  settings: 'Settings',
}

function TopBar({ activeView, onMenuClick }) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="topbar__menu-btn"
          aria-label="Open navigation menu"
          onClick={onMenuClick}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="topbar__titles">
          <h2 className="topbar__page-title">{VIEW_TITLES[activeView] ?? 'Dashboard'}</h2>
          <span className="topbar__breadcrumb">Decision Regret Predictor</span>
        </div>
      </div>

      <div className="topbar__right">
        <span className="topbar__demo-badge" title="This build shows sample data only">
          Demo data
        </span>
        <div className="topbar__profile">
          <span className="topbar__avatar" aria-hidden="true">{DEMO_USER.initials}</span>
          <span className="topbar__profile-text">
            <strong>{DEMO_USER.name}</strong>
            <span>{DEMO_USER.email}</span>
          </span>
        </div>
      </div>
    </header>
  )
}

export default TopBar
