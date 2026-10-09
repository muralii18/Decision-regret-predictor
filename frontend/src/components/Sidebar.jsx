import './Sidebar.css'

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    id: 'new-prediction',
    label: 'New Prediction',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  },
  {
    id: 'history',
    label: 'Decision History',
    icon: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
        <path d="M3 4.5V10h5.5" />
        <path d="M12 8v4.3l3 1.8" />
      </>
    ),
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: (
      <>
        <path d="M3.5 20.5h17" />
        <rect x="4.5" y="11" width="3.2" height="7" rx="1" />
        <rect x="10.4" y="5.5" width="3.2" height="12.5" rx="1" />
        <rect x="16.3" y="14.5" width="3.2" height="3.5" rx="1" />
      </>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <>
        <path d="M4 7.5h9" />
        <path d="M18.5 7.5H20" />
        <circle cx="15.8" cy="7.5" r="2.3" />
        <path d="M4 16.5h4.5" />
        <path d="M13.5 16.5H20" />
        <circle cx="10.8" cy="16.5" r="2.3" />
      </>
    ),
  },
]

function Sidebar({ activeView, onNavigate, open }) {
  return (
    <aside className={`sidebar${open ? " is-open" : ""}`} aria-label="Main navigation">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 16.5 9 10.5l4 4 8-8.5" />
            <path d="M15 6h6v6" />
          </svg>
        </span>
        <span className="sidebar__brand-text">
          <strong>Decision Regret</strong>
          <span>Predictor</span>
        </span>
      </div>

      <nav className="sidebar__nav">
        <p className="sidebar__section-label">Menu</p>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`sidebar__link${activeView === item.id ? ' sidebar__link--active' : ''}`}
                aria-current={activeView === item.id ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {item.icon}
                </svg>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__demo-pill">Demo build</span>
        <p>UI preview only &mdash; no backend connected.</p>
      </div>
    </aside>
  )
}

export default Sidebar
