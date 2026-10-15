import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import PredictionResults from './PredictionResults'

const DECISION = {
  id: '17',
  title: 'Approve Q4 supplier contract renewal',
  decision_date: '2026-10-15',
  category: 'Supplier Selection',
  estimated_cost_usd: 250000,
  num_alternatives: 4,
  confidence_level: 'Medium',
  business_context: 'We are selecting a new logistics vendor before the renewal deadline.',
  expected_benefits: 'Lower per-unit shipping cost and faster delivery times.',
  identified_risks: 'Migration effort and a single-provider dependency.',
}

const PREDICTION = {
  decision_id: '17',
  probability_of_reversal: 0.42,
  probability_percent: 42,
  predicted_class: 0,
  predicted_label: 'Not reversed',
  threshold: 0.5,
  dataset: 'synthetic',
  disclaimer:
    'Experimental prototype: the model was trained on a small synthetic dataset (39 labelled rows).',
}

describe('with a real prediction', () => {
  test('renders the returned probability, class, summary and disclaimer', () => {
    render(
      <PredictionResults
        decision={DECISION}
        prediction={PREDICTION}
        onViewHistory={vi.fn()}
        onNewPrediction={vi.fn()}
      />,
    )

    expect(screen.getByText('42.0%')).toBeTruthy()
    expect(screen.getByText('Not reversed')).toBeTruthy()
    expect(screen.getByText(PREDICTION.disclaimer)).toBeTruthy()

    // Decision summary from the actual backend row.
    expect(screen.getByText('17')).toBeTruthy()
    expect(screen.getByText('Approve Q4 supplier contract renewal')).toBeTruthy()
    expect(screen.getByText('$250,000.00')).toBeTruthy()
    expect(screen.getByText(/Dataset: synthetic/)).toBeTruthy()
    expect(screen.getByText(/Threshold: 0\.5/)).toBeTruthy()
  })

  test('never invents risk levels, factors, intervals or accuracy claims', () => {
    render(<PredictionResults decision={DECISION} prediction={PREDICTION} />)

    // No "risk classification" panel exists — the model returns a class, not a level.
    expect(screen.queryByText('Risk classification')).toBeNull()
    // Contributing factors stays an honest "not available".
    const factors = screen.getByText('Contributing factors').closest('section')
    expect(factors.textContent).toContain('Not available yet')
    expect(factors.textContent).toContain('no factors are listed and none are invented')
    // The predicted class is explicitly labelled as model output, not a level.
    expect(screen.getByText(/Model output only — no risk classification is computed/)).toBeTruthy()
  })
})

describe('without a prediction', () => {
  test('an empty result shows the empty state and no numbers', () => {
    render(<PredictionResults />)
    expect(screen.getByText('No prediction results yet')).toBeTruthy()
    expect(screen.queryByText(/\d+(\.\d+)?%/)).toBeNull()
  })

  test('a saved decision without a prediction offers generation, with errors surfaced', () => {
    const onGenerate = vi.fn()
    render(
      <PredictionResults
        decision={DECISION}
        prediction={null}
        error="The ML service is unavailable. No prediction was saved."
        onGenerate={onGenerate}
        onViewHistory={vi.fn()}
      />,
    )

    expect(screen.getByText('No prediction saved for this decision')).toBeTruthy()
    expect(
      screen.getByText('The ML service is unavailable. No prediction was saved.'),
    ).toBeTruthy()
    // The decision summary still shows what was actually saved.
    expect(screen.getByText('Approve Q4 supplier contract renewal')).toBeTruthy()
    // No fabricated probability.
    expect(screen.queryByText(/\d+(\.\d+)?%/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Generate prediction' }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  test('links back to history and new prediction', () => {
    const onViewHistory = vi.fn()
    const onNewPrediction = vi.fn()
    render(<PredictionResults onViewHistory={onViewHistory} onNewPrediction={onNewPrediction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Decision History' }))
    expect(onViewHistory).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Go to New Prediction' }))
    expect(onNewPrediction).toHaveBeenCalledTimes(1)
  })
})
