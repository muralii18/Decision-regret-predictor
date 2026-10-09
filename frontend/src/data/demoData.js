// ---------------------------------------------------------------------------
// DEMO DATA — illustrative sample records for layout/UX preview only.
// No backend, ML model or database is connected yet. These values are static
// and must be replaced with real API data in a later step.
// ---------------------------------------------------------------------------

export const DEMO_USER = {
  name: 'Demo User',
  email: 'demo@decision-regret.local',
  initials: 'DU',
}

export const HIGH_RISK_THRESHOLD = 70

export const DEMO_DECISIONS = [
  { id: 1, name: 'Accept Senior Data Scientist role in Berlin', category: 'Career', riskScore: 84, status: 'Reversed', date: '2026-10-02' },
  { id: 2, name: 'Purchase electric vehicle', category: 'Purchase', riskScore: 61, status: 'Pending', date: '2026-09-30' },
  { id: 3, name: 'Relocate to Hyderabad', category: 'Relocation', riskScore: 76, status: 'Confirmed', date: '2026-09-27' },
  { id: 4, name: 'Launch freelance side business', category: 'Business', riskScore: 45, status: 'Confirmed', date: '2026-09-24' },
  { id: 5, name: 'Move savings into equity index fund', category: 'Finance', riskScore: 88, status: 'Reversed', date: '2026-09-21' },
  { id: 6, name: 'Renegotiate apartment lease', category: 'Housing', riskScore: 34, status: 'Confirmed', date: '2026-09-18' },
  { id: 7, name: 'Enroll in part-time MBA', category: 'Education', riskScore: 69, status: 'Pending', date: '2026-09-15' },
  { id: 8, name: 'Switch health insurance provider', category: 'Insurance', riskScore: 27, status: 'Confirmed', date: '2026-09-12' },
  { id: 9, name: 'Extend team headcount by two', category: 'Business', riskScore: 73, status: 'Reversed', date: '2026-09-08' },
  { id: 10, name: 'Adopt remote-first work policy', category: 'Career', riskScore: 38, status: 'Confirmed', date: '2026-09-03' },
]

// Derives the dashboard summary metrics directly from the demo records so
// the summary cards always stay consistent with the table.
export function computeSummaryStats(decisions) {
  const total = decisions.length
  const highRisk = decisions.filter((d) => d.riskScore >= HIGH_RISK_THRESHOLD).length
  const reversed = decisions.filter((d) => d.status === 'Reversed').length
  const averageRisk = total === 0 ? 0 : decisions.reduce((sum, d) => sum + d.riskScore, 0) / total
  return {
    totalDecisions: total,
    highRiskDecisions: highRisk,
    reversedDecisions: reversed,
    averageRegretRisk: Math.round(averageRisk * 10) / 10,
  }
}

export function getRiskLevel(score) {
  if (score >= HIGH_RISK_THRESHOLD) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export function formatDemoDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
