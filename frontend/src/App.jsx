import { useState } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import DashboardView from './components/DashboardView'
import DecisionHistory from './components/DecisionHistory'
import NewDecisionForm from './components/NewDecisionForm'
import DataUpload from './components/DataUpload'
import PredictionResults from './components/PredictionResults'
import LandingPage from './components/LandingPage'
import AuthPlaceholder from './components/AuthPlaceholder'
import { createPrediction } from './lib/api'
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
          This section is reserved in the navigation but is not implemented yet. It uses no data —
          live views are the Dashboard, New Prediction, Prediction Results, Historical Data Upload
          and Decision History.
        </p>
      </section>
    </>
  )
}

/**
 * Application shell.
 *
 * `results` holds the actual backend rows shown on the Prediction Results
 * view: { decision, prediction } — both returned by the API, never
 * fabricated. `initialView` exists for tests; production starts at 'landing'.
 */
function App({ initialView = 'landing' }) {
  const [activeView, setActiveView] = useState(initialView)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [results, setResults] = useState(null)
  const [resultAction, setResultAction] = useState({ busy: false, error: null })

  function navigate(view) {
    setActiveView(view)
    setSidebarOpen(false)
    window.scrollTo(0, 0)
  }

  function showResults(next) {
    setResults(next)
    setResultAction({ busy: false, error: null })
    navigate('results')
  }

  /** POST /api/decisions/:id/predictions for the currently open result. */
  async function generateResultPrediction() {
    if (!results?.decision || resultAction.busy) return
    setResultAction({ busy: true, error: null })
    try {
      const prediction = await createPrediction(results.decision.id)
      setResults({ decision: results.decision, prediction })
      setResultAction({ busy: false, error: null })
    } catch (error) {
      setResultAction({
        busy: false,
        error: error?.message ?? 'The prediction request failed.',
      })
    }
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
    content = <DashboardView onNewPrediction={() => navigate('new-prediction')} onShowResults={showResults} />
  } else if (activeView === 'new-prediction') {
    content = (
      <NewDecisionForm
        onCancel={() => navigate('dashboard')}
        onViewHistory={() => navigate('history')}
        onPredictionReady={(decision, prediction) => showResults({ decision, prediction })}
      />
    )
  } else if (activeView === 'upload') {
    content = <DataUpload />
  } else if (activeView === 'results') {
    content = (
      <PredictionResults
        decision={results?.decision ?? null}
        prediction={results?.prediction ?? null}
        busy={resultAction.busy}
        error={resultAction.error}
        onGenerate={generateResultPrediction}
        onViewHistory={() => navigate('history')}
        onNewPrediction={() => navigate('new-prediction')}
      />
    )
  } else if (activeView === 'history') {
    content = (
      <DecisionHistory onNewPrediction={() => navigate('new-prediction')} onShowResults={showResults} />
    )
  } else {
    content = (
      <PlaceholderView
        title={PLACEHOLDER_VIEWS[activeView]?.title ?? 'Not found'}
        description={PLACEHOLDER_VIEWS[activeView]?.description ?? ''}
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
