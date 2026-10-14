import { Router } from 'express'
import { asyncHandler, badRequest, HttpError } from '../middleware/errors.js'
import { MlServiceError } from '../ml/client.js'
import {
  parseId,
  parsePagination,
  validateDecisionInput,
  validateOutcomeInput,
} from '../validation/validate.js'

const ML_STATUS_BY_CODE = {
  // FastAPI says the model artifact is missing/unreadable.
  ML_UNAVAILABLE: 503,
  // Our request never reached a working model (timeout).
  ML_TIMEOUT: 504,
  // Upstream rejected or returned garbage — never persisted.
  ML_REJECTED: 502,
  ML_BAD_RESPONSE: 502,
}

function requireId(req) {
  const id = parseId(req.params.id)
  if (!id) throw badRequest('invalid_id', 'Decision id must be a positive integer.')
  return id
}

async function requireDecision(repo, id) {
  const decision = await repo.getDecision(id)
  if (!decision) {
    throw new HttpError(404, 'decision_not_found', `Decision ${id} does not exist.`)
  }
  return decision
}

export function decisionsRouter({ repo, ml }) {
  const router = Router()

  // POST /api/decisions — validate and create.
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const result = validateDecisionInput(req.body)
      if (!result.ok) {
        throw badRequest('validation_failed', 'The decision payload is invalid.', result.errors)
      }
      const decision = await repo.createDecision(result.value)
      res.status(201).json(decision)
    }),
  )

  // GET /api/decisions — history, newest first, paginated.
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const pagination = parsePagination(req.query)
      if (!pagination.ok) {
        throw badRequest('validation_failed', 'Invalid pagination parameters.', pagination.errors)
      }
      const { rows, totalCount } = await repo.listDecisions(pagination.value)
      res.json({
        data: rows.map(serializeListRow),
        pagination: { ...pagination.value, total: totalCount },
      })
    }),
  )

  // GET /api/decisions/:id — decision + outcome + all predictions.
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = requireId(req)
      const decision = await requireDecision(repo, id)
      const [outcome, predictions] = await Promise.all([
        repo.getOutcome(id),
        repo.listPredictions(id),
      ])
      res.json({ ...decision, outcome: outcome ?? null, predictions })
    }),
  )

  // POST /api/decisions/:id/outcomes — record or update the actual outcome.
  router.post(
    '/:id/outcomes',
    asyncHandler(async (req, res) => {
      const id = requireId(req)
      const decision = await requireDecision(repo, id)
      const result = validateOutcomeInput(req.body, { decisionDate: decision.decision_date })
      if (!result.ok) {
        throw badRequest('validation_failed', 'The outcome payload is invalid.', result.errors)
      }
      const outcome = await repo.upsertOutcome(id, result.value)
      res.status(200).json(outcome)
    }),
  )

  // POST /api/decisions/:id/predictions — genuine ML prediction, persisted
  // only after a validated successful response. Never fabricates results.
  router.post(
    '/:id/predictions',
    asyncHandler(async (req, res) => {
      const id = requireId(req)
      const decision = await requireDecision(repo, id)

      let prediction
      try {
        prediction = await ml.predict(decision)
      } catch (error) {
        if (error instanceof MlServiceError) {
          const status = ML_STATUS_BY_CODE[error.code] ?? 502
          throw new HttpError(status, error.code.toLowerCase(), error.publicMessage)
        }
        throw error
      }

      const saved = await repo.insertPrediction(id, {
        ...prediction,
        provider_response: prediction,
      })
      res.status(201).json(saved)
    }),
  )

  // GET /api/decisions/:id/predictions — saved predictions, newest first.
  router.get(
    '/:id/predictions',
    asyncHandler(async (req, res) => {
      const id = requireId(req)
      await requireDecision(repo, id)
      const predictions = await repo.listPredictions(id)
      res.json({ data: predictions })
    }),
  )

  return router
}

/** Shape a list row: flatten the outcome join into an `outcome` object. */
function serializeListRow(row) {
  const { outcome_value, outcome_date_value, outcome_note, outcome_updated_at, ...decision } = row
  return {
    ...decision,
    outcome: outcome_value
      ? {
          outcome: outcome_value,
          outcome_date: outcome_date_value,
          note: outcome_note,
          updated_at: outcome_updated_at,
        }
      : null,
  }
}
