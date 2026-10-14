/**
 * Environment configuration. Values come from process.env, optionally
 * loaded from backend/.env (never committed; see .env.example).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Load backend/.env regardless of the process working directory.
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') })

function intFromEnv(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development'
  // Origins: explicit allow-list. In production, an unset CORS_ORIGIN means
  // no CORS headers at all (restrictive by default — never '*').
  const defaultOrigins =
    nodeEnv === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'
  const corsOrigins = (env.CORS_ORIGIN ?? defaultOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return {
    nodeEnv,
    port: intFromEnv(env.PORT, 3001),
    databaseUrl: (env.DATABASE_URL ?? '').trim(),
    mlServiceUrl: (env.ML_SERVICE_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    mlTimeoutMs: intFromEnv(env.ML_TIMEOUT_MS, 5000),
    poolMax: intFromEnv(env.PG_POOL_MAX, 10),
    corsOrigins,
  }
}

export { BACKEND_ROOT }
