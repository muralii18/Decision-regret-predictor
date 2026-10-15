import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Vitest configuration (kept separate from vite.config.js so the dev-server
// proxy settings never apply to tests).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
})
