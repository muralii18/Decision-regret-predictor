import { Router } from 'express'
import { asyncHandler } from '../middleware/errors.js'

export function healthRouter({ repo, config }) {
  const router = Router()

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      let database = 'ok'
      try {
        await repo.healthCheck()
      } catch {
        database = 'unavailable'
      }
      res.json({
        status: database === 'ok' ? 'ok' : 'degraded',
        service: 'decision-regret-predictor-backend',
        database,
        // Reported as configured-only; /health does not call the ML service
        // (a slow ML probe would make health checks unreliable).
        ml_service: config.mlServiceUrl ? 'configured' : 'not_configured',
        time: new Date().toISOString(),
      })
    }),
  )

  return router
}
