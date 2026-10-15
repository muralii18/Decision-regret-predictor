import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Optional same-origin API proxy. Set PROXY_TARGET (server-side env, e.g.
// PROXY_TARGET=http://127.0.0.1:3001) to forward /api and /health to the
// Express backend through the dev server. This only forwards requests — the
// frontend never starts backend services (see README "Running the services").
const proxyTarget = (process.env.PROXY_TARGET ?? '').trim()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: proxyTarget
    ? {
        proxy: {
          '/api': proxyTarget,
          '/health': proxyTarget,
        },
      }
    : {},
})
