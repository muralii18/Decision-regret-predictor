/** Server entry point: wires the real PostgreSQL pool, the repository and
 * the FastAPI ML client, then starts Express.
 *
 * This process never starts Python or PostgreSQL itself — run those
 * separately (see backend/README.md). */
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createPool } from './db/pool.js'
import { createRepo } from './db/repo.js'
import { MlClient } from './ml/client.js'

const config = loadConfig()

if (!config.databaseUrl) {
  console.error(
    'DATABASE_URL is required. Copy backend/.env.example to backend/.env and set it.',
  )
  process.exit(1)
}

const pool = createPool(config)
const repo = createRepo(pool)
const ml = new MlClient({ baseUrl: config.mlServiceUrl, timeoutMs: config.mlTimeoutMs })

const app = createApp({ repo, ml, config })

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(
    `decision-regret backend listening on http://127.0.0.1:${config.port} ` +
      `(ML service: ${config.mlServiceUrl}, CORS origins: ${
        config.corsOrigins.length > 0 ? config.corsOrigins.join(', ') : 'none'
      })`,
  )
})

function shutdown(signal) {
  console.log(`${signal} received — shutting down`)
  server.close(() => {
    pool.end().finally(() => process.exit(0))
  })
  // Failsafe if a connection refuses to drain.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
