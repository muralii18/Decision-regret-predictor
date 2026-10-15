/** Express application factory. Dependencies (repo, ml) are injected so
 * tests can run the real HTTP stack with an in-memory repo and a mock or
 * real ML service. */
import cors from 'cors'
import express from 'express'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { decisionsRouter } from './routes/decisions.js'
import { healthRouter } from './routes/health.js'

const BODY_LIMIT = '100kb'

export function createApp({ repo, ml, config, logger = console }) {
  const app = express()
  app.disable('x-powered-by')

  // CORS: explicit allow-list from config (Vite dev origins by default).
  // An empty list disables CORS entirely — never '*'.
  app.use(
    cors(
      config.corsOrigins.length > 0
        ? { origin: config.corsOrigins, methods: ['GET', 'POST', 'OPTIONS'] }
        : { origin: false },
    ),
  )

  app.use(express.json({ limit: BODY_LIMIT }))
  app.use((req, res, next) => {
    res.set('cache-control', 'no-store')
    next()
  })

  app.use('/health', healthRouter({ repo, config, ml }))
  app.use('/api/decisions', decisionsRouter({ repo, ml }))

  app.use(notFoundHandler)
  app.use(errorHandler(logger))

  return app
}
