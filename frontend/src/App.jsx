import { useState } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import SummaryCards from './components/SummaryCards'
import DecisionsTable from './components/DecisionsTable'
import NewDecisionForm from './components/NewDecisionForm'
import DataUpload from './components/DataUpload'
import PredictionResults from './components/PredictionResults'
import LandingPage from './components/LandingPage'
import AuthPlaceholder from './components/AuthPlaceholder'
import { DEMO_DECISIONS, computeSummaryStats } from './data/demoData'
import './App.css'

// Views that are planned in the sidebar but intentionally not built yet.
const PLACEHOLDER_VIEWS = {
  analytics: {
    title: 'Analytics',
    description: 'Charts and analytics will be implemented in a later step.',
  },
  settings: {
    title: 'Settings',
    description: 'Application settings will be implemented in a later step.',
  },
}

function DashboardView({ onNewPrediction }) {
  const stats = computeSummaryStats(DEMO_DECISIONS)

  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Dashboard</h1>
          <p>Overview of your decision regret predictions.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={onNewPrediction}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Prediction
        </button>
      </div>

      <SummaryCards stats={stats} />
      <DecisionsTable decisions={DEMO_DECISIONS} />
    </>
  )
}

function HistoryView({ outcomes, onSaveOutcome }) {
  // Newest decisions first (ISO dates sort correctly as strings).
  const sortedDecisions = [...DEMO_DECISIONS].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>Decision History</h1>
          <p>
            All recorded decisions with their demo status and any actual outcome you capture in this
            session. Sorted newest first.
          </p>
        </div>
      </div>

      <DecisionsTable
        decisions={sortedDecisions}
        title="Decision History"
        subtitle="Demo statuses and risk scores are sample data — not verified outcomes or model predictions."
        riskScoreHeader="Risk Score (demo)"
        statusHeader="Demo Status (sample)"
        outcomes={outcomes}
        onRecordOutcome={onSaveOutcome}
        footerNote={
          'Showing ' +
          sortedDecisions.length +
          ' decisions — newest first. Demo statuses are sample data and are never overwritten ' +
          'by recorded outcomes. Recorded outcomes are session-only and are not yet saved to ' +
          'PostgreSQL; “Not reversed” remains provisional until an observation window (180 or ' +
          '365 days) is defined and has elapsed.'
        }
      />
    </>
  )
}

function PlaceholderView({ title, description }) {
  return (
    <>
      <div className="page-header">
        <div className="page-header__text">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <section className="placeholder">
        <h2>Coming soon</h2>
        <p>
          This section is reserved in the navigation but not part of the initial dashboard build.
          The current step delivers the dashboard UI only, using sample demo data.
        </p>
      </section>
    </>
  )
}

function App() {
  const [activeView, setActiveView] = useState('landing')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Session-only map of decisionId -> { outcome, outcomeDate, note }.
  // Never touches DEMO_DECISIONS: demo status/riskScore stay untouched.
  // Not persisted (no localStorage/sessionStorage); PostgreSQL comes later.
  const [outcomes, setOutcomes] = useState({})

  function navigate(view) {
    setActiveView(view)
    setSidebarOpen(false)
    window.scrollTo(0, 0)
  }

  function saveOutcome(decisionId, record) {
    setOutcomes((prev) => ({ ...prev, [decisionId]: record }))
  }

  // Public views render outside the dashboard shell (no sidebar/topbar).
  if (activeView === 'landing') {
    return <LandingPage onLogin={() => navigate('login')} onGetStarted={() => navigate('register')} />
  }
  if (activeView === 'login' || activeView === 'register') {
    return (
      <AuthPlaceholder
        mode={activeView}
        onBack={() => navigate('landing')}
        onEnterApp={() => navigate('dashboard')}
      />
    )
  }

  let content
  if (activeView === 'dashboard') {
    content = <DashboardView onNewPrediction={() => navigate('new-prediction')} />
  } else if (activeView === 'new-prediction') {
    content = <NewDecisionForm onCancel={() => navigate('dashboard')} />
  } else if (activeView === 'upload') {
    content = <DataUpload />
  } else if (activeView === 'results') {
    content = <PredictionResults onSubmitPrediction={() => navigate('new-prediction')} />
  } else if (activeView === 'history') {
    content = <HistoryView outcomes={outcomes} onSaveOutcome={saveOutcome} />
  } else {
    content = (
      <PlaceholderView
        title={PLACEHOLDER_VIEWS[activeView].title}
        description={PLACEHOLDER_VIEWS[activeView].description}
      />
    )
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <Sidebar activeView={activeView} onNavigate={navigate} open={sidebarOpen} />
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <div className="app-body">
        <TopBar activeView={activeView} onMenuClick={() => setSidebarOpen(true)} onHome={() => navigate('landing')} />
        <main className="app-content" id="main-content">
          {content}
        </main>
      </div>
    </div>
  )
}

export default App
