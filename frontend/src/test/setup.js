import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// React Testing Library cleanup between tests (globals are disabled).
afterEach(() => {
  cleanup()
})

// jsdom does not implement scrolling (App.navigate calls window.scrollTo).
window.scrollTo = vi.fn()
