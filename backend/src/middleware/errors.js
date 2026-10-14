/**
 * Error handling. Client responses carry safe, generic messages only —
 * credentials, connection strings, stack traces and SQL details are logged
 * server-side (via the injected logger) and never serialized to clients.
 */

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function badRequest(code, message, details) {
  return new HttpError(400, code, message, details)
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found', message: 'The requested endpoint does not exist.' })
}

/** Wrap async route handlers so rejections reach the error middleware. */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

// PostgreSQL error codes we can translate into safe client responses.
const PG_CODES = {
  23505: [409, 'duplicate', 'A conflicting record already exists.'],
  23503: [400, 'foreign_key_violation', 'A referenced record does not exist.'],
  23514: [400, 'constraint_violation', 'The request violates a database constraint.'],
  23502: [400, 'missing_required_field', 'A required field is missing.'],
}

export function errorHandler(logger = console) {
  // Express identifies error middleware by its 4-arg arity.
  return (error, req, res, next) => {
    if (res.headersSent) return next(error)

    // Malformed JSON body.
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON.' })
    }
    // Body over the configured limit.
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large', message: 'Request body is too large.' })
    }
    // Postgres constraint/foreign-key issues.
    if (typeof error?.code === 'string' && PG_CODES[error.code]) {
      const [status, code, message] = PG_CODES[error.code]
      logger.error(`db error ${error.code} on ${req.method} ${req.path}`)
      return res.status(status).json({ error: code, message })
    }
    // Lost database connection / server down.
    if (
      (typeof error?.code === 'string' && error.code.startsWith('08')) ||
      error?.code === 'ECONNREFUSED' ||
      error?.name === 'ConnectTimeoutError'
    ) {
      logger.error(`database unavailable on ${req.method} ${req.path}: ${error.message}`)
      return res
        .status(503)
        .json({ error: 'database_unavailable', message: 'The database is unavailable. Please retry later.' })
    }
    // Our own safe HTTP errors.
    if (error instanceof HttpError) {
      const body = { error: error.code, message: error.message }
      if (error.details) body.details = error.details
      return res.status(error.status).json(body)
    }

    // Unexpected: log everything server-side, tell the client nothing else.
    logger.error(`unhandled error on ${req.method} ${req.path}:`, error)
    return res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred.' })
  }
}
