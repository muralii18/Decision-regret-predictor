import { formatDemoDate, getRiskLevel } from '../data/demoData'
import './DecisionsTable.css'

function StatusBadge({ status }) {
  const toneClass =
    status === 'Reversed' ? 'badge--danger' : status === 'Pending' ? 'badge--warning' : 'badge--success'
  return <span className={`badge ${toneClass}`}>{status}</span>
}

function DecisionsTable({ decisions }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h3 className="panel__title">Recent Decisions</h3>
          <p className="panel__subtitle">Latest entries from the sample dataset</p>
        </div>
        <span className="panel__demo-tag">Demo data</span>
      </div>

      <div className="table-wrap">
        <table className="decisions-table">
          <caption className="visually-hidden">
            Recent decisions with category, regret risk score, status and date (demo sample data)
          </caption>
          <thead>
            <tr>
              <th scope="col">Decision</th>
              <th scope="col">Category</th>
              <th scope="col">Risk Score</th>
              <th scope="col">Status</th>
              <th scope="col">Date</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((decision) => (
              <tr key={decision.id}>
                <td className="cell-name">{decision.name}</td>
                <td>
                  <span className="category-tag">{decision.category}</span>
                </td>
                <td>
                  <div className="risk-cell">
                    <span className={`risk-score risk-score--${getRiskLevel(decision.riskScore)}`}>
                      {decision.riskScore}%
                    </span>
                    <span className="risk-bar" aria-hidden="true">
                      <span
                        className={`risk-bar__fill risk-bar__fill--${getRiskLevel(decision.riskScore)}`}
                        style={{ width: `${decision.riskScore}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={decision.status} />
                </td>
                <td className="cell-date">{formatDemoDate(decision.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="panel__footer-note">
        Showing {decisions.length} of {decisions.length} demo records &mdash; sample data for layout preview only.
      </p>
    </section>
  )
}

export default DecisionsTable
