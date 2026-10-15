import { Router } from 'express'
import { asyncHandler } from '../middleware/errors.js'

export function healthRouter({ repo, config, ml }) {
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

      // Default: report configuration only — /health must stay fast, so a
      // plain GET never calls the ML service. `GET /health?ml=1` opts in to
      // a real probe so the UI can show an accurate integration status
      // instead of claiming the model is available.
      const probeMl = req.query.ml === '1' || req.query.ml === 'true'
      let mlService = config.mlServiceUrl ? 'configured' : 'not_configured'
      let mlDetail = null
      let mlProbed = false
      if (probeMl && config.mlServiceUrl) {
        mlProbed = true
        if (ml && typeof ml.probeHealth === 'function') {
          const probe = await ml.probeHealth()
          mlService = probe.status
          mlDetail = probe.modelLoaded
        } else {
          mlService = 'unavailable'
        }
      }

      res.json({
        status: database === 'ok' ? 'ok' : 'degraded',
        service: 'decision-regret-predictor-backend',
        database,
        ml_service: mlService,
        ml_probed: mlProbed,
        ...(mlProbed ? { ml_model_loaded: mlDetail } : {}),
        time: new Date().toISOString(),
      })
    }),
  )

  return router
}
