# Decision Regret Predictor — Express Backend

Node.js/Express + PostgreSQL backend. Stores decisions and outcomes and
proxies prediction requests to the FastAPI ML service (`ml/`, see
`ml/README.md`). **No authentication exists yet** — this service is for
local development and must not be exposed publicly.

## Requirements

| | |
|---|---|
| Node.js | 21 or newer (tested on 24; uses the built-in `node:test` runner and fetch) |
| PostgreSQL | 14 or newer (tested with 17) |
| ML service | the FastAPI app in `ml/` with a trained model (see `ml/README.md`) |

## Setup

```bash
# Linux / macOS
cd backend
cp .env.example .env         # then edit values
npm install
npm run migrate              # applies migrations/*.sql once each
npm run dev                  # or: npm start
```

Windows PowerShell (call the venv/`node` executables directly; do not use
Unix `source`/`activate` syntax):

```powershell
cd backend
Copy-Item .env.example .env   # then edit values
npm install
npm run migrate
npm run dev
```

### Environment variables (`backend/.env`, never committed)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string, e.g. `postgresql://user:password@127.0.0.1:5432/decision_regret` |
| `ML_SERVICE_URL` | `http://127.0.0.1:8000` | FastAPI base URL |
| `ML_TIMEOUT_MS` | `5000` | Timeout for ML prediction calls |
| `PORT` | `3001` | Express listen port |
| `PG_POOL_MAX` | `10` | Connection-pool size |
| `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allow-list (Vite dev origins). In production, unset means **no CORS** — never `*`. |

### Running the three services separately

This backend never starts Python or PostgreSQL itself:

```bash
# 1. PostgreSQL — your own server, or e.g. docker run -p 5432:5432 postgres
# 2. ML service
cd ml && ../.venv/bin/uvicorn prediction.main:app --reload        # docs at :8000/docs
# 3. Backend
cd backend && npm run dev                                          # API at :3001
```

PowerShell variants:

```powershell
cd ml; ..\.venv\Scripts\uvicorn.exe prediction.main:app --reload
cd backend; npm run dev
```

## API

All bodies are JSON. Invalid input → `400` with
`{ "error": "validation_failed", "message", "details": [{ "field", "message" }] }`.
Ids are strings (BIGSERIAL). Unknown fields on decision/outcome bodies are
rejected, so outcome/label columns can never sneak into decision input.

| Method & path | Purpose |
|---|---|
| `GET /health` | `{ status, database: ok\|unavailable, ml_service }` — `ml_service: configured\|not_configured` (configuration only; never calls the ML service). With `?ml=1` the endpoint performs a **real ML probe** and reports `ml_service: ok\|no_model\|unreachable\|unhealthy` plus `ml_model_loaded` — used by the frontend landing page's live service status |
| `POST /api/decisions` | Create a decision (`201` + row). Body: `title`, `decision_date?` (ISO, not future, defaults to today), `category`, `estimated_cost_usd` (> 0), `num_alternatives` (int ≥ 0), `confidence_level`, `business_context`, `expected_benefits`, `identified_risks` |
| `GET /api/decisions?limit=&offset=` | History, newest first; `{ data, pagination }` |
| `GET /api/decisions/:id` | Decision + `outcome` + `predictions` |
| `POST /api/decisions/:id/outcomes` | Record or update the outcome (`200`). `{ outcome: reversed\|not_reversed\|unknown, outcome_date?, note? }` — `unknown` must omit the date and is **never** stored as `not_reversed` |
| `POST /api/decisions/:id/predictions` | Calls FastAPI with the **seven decision-time features only**; persists a genuine validated response (`201`). ML down/timeout/model-missing → honest `503`/`504`; invalid ML body → `502`; nothing is ever fabricated or persisted on failure |
| `GET /api/decisions/:id/predictions` | Saved predictions, newest first |

Categories, confidence levels and text minimums mirror the frontend New
Decision form and the ML preprocessing rules (single source of truth:
`src/validation/validate.js` — keep in sync when either side changes).

### Prediction persistence

`predictions` stores `probability_of_reversal` (CHECK 0–1),
`probability_percent`, `predicted_class` (0/1), `predicted_label`,
`threshold`, `dataset`, the model's `disclaimer` **verbatim**, plus
`provider_response` JSONB — the exact FastAPI response. No risk levels,
explanations or confidence intervals are ever invented.

## Database

Migrations: `migrations/*.sql`, applied in filename order by
`npm run migrate`, recorded in `schema_migrations`, each in a transaction.

Tables: `decisions` (metadata `title`/`decision_date` kept separate from the
seven ML features), `decision_outcomes` (UNIQUE per decision;
`reversed`/`not_reversed` require a date, `unknown` forbids one),
`predictions` (probability bounds CHECKed in the database). All queries are
parameterized — user input is never concatenated into SQL.

## Tests

```bash
# Linux / macOS                # Windows PowerShell
cd backend && npm test         cd backend; npm test
```

- `tests/validation.test.js` — request validation rules
- `tests/mlClient.test.js` — exact seven-feature payload mapping, timeout,
  unavailable, malformed-response handling (stubbed fetch + real abort signal)
- `tests/decisions.api.test.js` — full HTTP stack with an in-memory repo and
  a real fake ML HTTP server
- `tests/live-db.test.js` — **real PostgreSQL**: migrations, CRUD,
  constraints, parameterization (hostile-text round-trip), cascade. Uses
  `TEST_DATABASE_URL` if set (point it at a dedicated disposable test
  database!), otherwise boots an embedded PostgreSQL 17 in a temp directory
  via the `embedded-postgres` dev dependency; skips with a clear message if
  neither is possible.

```powershell
# Optional: live tests against your own test database
$env:TEST_DATABASE_URL = "postgresql://user:pw@127.0.0.1:5432/drp_test"
npm test
```

`npm run check` syntax-checks every source file.

## Security notes

- No authentication/authorization yet — do not expose publicly. Adding it
  (sessions/JWT + the future user model) is a prerequisite for production.
- Errors never leak credentials, connection strings, stack traces or SQL;
  details go to server logs only.
- Request bodies are limited to 100 KB; CORS is an explicit origin allow-list.
- `.env` is git-ignored (root `.gitignore`); only `.env.example` is tracked.
