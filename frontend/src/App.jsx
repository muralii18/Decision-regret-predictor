import { useState } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import SummaryCards from './components/SummaryCards'
import DecisionsTable from './components/DecisionsTable'
import NewDecisionForm from './components/NewDecisionForm'
import { DEMO_DECISIONS, computeSummaryStats } from './data/demoData'
import './App.css'

// Views that are planned in the sidebar but intentionally not built yet.
const PLACEHOLDER_VIEWS = {
  history: {
    title: 'Decision History',
    description: 'The full decision history view will be implemented in a later step.',
  },
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
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function navigate(view) {
    setActiveView(view)
    setSidebarOpen(false)
  }

  let content
  if (activeView === 'dashboard') {
    content = <DashboardView onNewPrediction={() => navigate('new-prediction')} />
  } else if (activeView === 'new-prediction') {
    content = <NewDecisionForm onCancel={() => navigate('dashboard')} />
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
        <TopBar activeView={activeView} onMenuClick={() => setSidebarOpen(true)} />
        <main className="app-content" id="main-content">
          {content}
        </main>
      </div>
    </div>
  )
}

export default App
