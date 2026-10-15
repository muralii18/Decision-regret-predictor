/**
 * Minimal fetch mock for integration tests.
 *
 * installFetchMock(routes) stubs globalThis.fetch with a router that:
 *  - matches on method + pathname (query strings ignored unless the route
 *    pattern is a RegExp tested against the full URL),
 *  - returns JSON responses, records every call in `calls`,
 *  - throws a network Error when a route sets `networkError: true`,
 *  - and throws loudly for any unmatched request (no silent fallthrough).
 *
 * Route shape: { method, path: string|RegExp, status?, body?, networkError?,
 *                delayMs? } — first match wins. `status` and `body` may be
 * functions of the call (with `attempt` = 1-based count for that route) to
 * script sequences such as fail-then-succeed.
 */
import { vi } from 'vitest'

export function installFetchMock(routes) {
  const calls = []

  const impl = async (url, init = {}) => {
    const href = String(url)
    const method = (init.method || 'GET').toUpperCase()
    let body = null
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    const pathname = new URL(href, 'http://localhost').pathname
    const call = { url: href, method, pathname, body, headers: init.headers ?? {}, attempt: 0 }
    call.attempt =
      calls.filter((existing) => existing.pathname === pathname && existing.method === method).length + 1
    calls.push(call)

    const route = routes.find((candidate) => {
      const candidateMethod = (candidate.method ?? 'GET').toUpperCase()
      if (candidateMethod !== method) return false
      if (candidate.path instanceof RegExp) return candidate.path.test(href)
      return pathname === candidate.path
    })

    if (!route) {
      throw new Error(`Unexpected request in test: ${method} ${href}`)
    }
    if (route.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, route.delayMs))
    }
    if (route.networkError) {
      throw new TypeError('fetch failed')
    }

    const status =
      typeof route.status === 'function' ? route.status(call) : (route.status ?? 200)
    const responseBody =
      typeof route.body === 'function' ? route.body(call) : (route.body ?? null)
    const text = JSON.stringify(responseBody)
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
    }
  }

  vi.stubGlobal('fetch', impl)
  return { calls }
}

/** Calls matching a method + pathname, in order. */
export function callsTo(calls, pathname, method = 'POST') {
  return calls.filter((call) => call.pathname === pathname && call.method === method)
}
