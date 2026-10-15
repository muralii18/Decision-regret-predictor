# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

---

## Decision Regret Predictor — project notes

This app is the frontend of the three-service stack described in the root
`README.md` (React → Express/PostgreSQL → FastAPI ML service).

### Environment variables

Copy `.env.example` to `.env` (or `.env.local`) and adjust — real `.env`
files are git-ignored, only the example is tracked.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001` | Express backend base URL used by `src/lib/api.js`. Empty value = same-origin requests. |
| `PROXY_TARGET` (read by `vite.config.js`, server-side) | *(unset)* | When set, the dev server forwards `/api` and `/health` to that URL (for environments where the browser cannot reach the backend directly). It only forwards requests — the frontend never starts backend services. |

### Scripts

```bash
npm run dev      # Vite dev server (default http://localhost:5173)
npm run build    # production build
npm run lint     # oxlint
npm test         # Vitest + Testing Library (integration/component tests)
```

### API integration

All backend calls live in one place: `src/lib/api.js` (loading, timeouts,
server error messages and per-field `details`, plus `toDecisionPayload` for
the New Decision form). Views never fetch directly and never fall back to
demo data when the API fails — the Dashboard and Decision History render
saved backend rows only; `src/data/demoData.js` is illustrative reference
data and is not presented as model output.

The landing page's live service status (`src/components/ServiceStatus.jsx`)
probes `GET /health?ml=1` and reports the real state of PostgreSQL, the
Express backend and the ML service — "the model is ready" is only shown
after a probe confirmed the trained model is loaded.

See the root `README.md` for the required services and their startup order.
