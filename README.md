# Decision Regret Predictor

Full-stack prototype that captures business decisions, stores them in
PostgreSQL through an Express API, and estimates the probability that a
decision will be reversed using a trained scikit-learn pipeline served by a
FastAPI service.

```
React/Vite (frontend/)  →  Express + PostgreSQL (backend/)  →  FastAPI ML service (ml/)
        :5173                    :3001  :5432                       :8000
```

> **Local development only — there is no authentication.** Never expose the
> backend publicly. The ML model is experimental (small synthetic dataset);
> predictions carry the model's own disclaimer and are not evidence of
> accuracy.

## Repository layout

| Directory | What it is |
|---|---|
| `frontend/` | React + Vite dashboard (forms, results, history, CSV validation) |
| `backend/` | Express API + PostgreSQL migrations and repository layer |
| `ml/` | Preprocessing, training, FastAPI prediction service, pytest suite |

Each directory has its own README with full details:
`frontend/README.md`, `backend/README.md`, `ml/README.md`.

## Required services and startup order

Start the services **in this order** — each one depends on the previous:

### 1. PostgreSQL, then database migrations

```bash
# any PostgreSQL 14+ server, e.g.:
docker run -d --name drp-pg -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:17
```

```powershell
cd backend
Copy-Item .env.example .env    # set DATABASE_URL (placeholders only in the example)
npm install                    # first run only
npm run migrate                # applies migrations/*.sql once each
```

### 2. FastAPI ML service (with the trained model artifact)

The artifact `ml/models/regret_risk_model.joblib` is git-ignored — train it
once if it does not exist. `/predict` returns 503 (no fabricated output)
without it.

```bash
python3 -m venv .venv                                   # first run only
.venv/bin/pip install -r ml/requirements.txt            # first run only
.venv/bin/python ml/training/train.py                   # creates the artifact
cd ml && ../.venv/bin/uvicorn prediction.main:app --reload    # :8000/docs
```

```powershell
.\.venv\Scripts\python.exe ml\training\train.py
cd ml
..\\.venv\Scripts\uvicorn.exe prediction.main:app --reload
```

### 3. Express backend (reaches PostgreSQL and FastAPI)

```bash
cd backend && npm run dev      # API on http://localhost:3001
```

```powershell
cd backend
npm run dev
```

`backend/.env` must set `DATABASE_URL` (step 1) and `ML_SERVICE_URL`
(default `http://127.0.0.1:8000`). Check: `GET http://localhost:3001/health`
→ `{ "status": "ok", "database": "ok", "ml_service": "configured" }`.

### 4. React/Vite frontend (reaches Express)

```bash
cd frontend && npm install      # first run only
npm run dev                     # http://localhost:5173
```

```powershell
cd frontend
npm install
npm run dev
```

The API base URL comes from `frontend/.env.example` → copy it to
`frontend/.env.local` if you need a non-default backend address. Defaults
and options:

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001` | Express backend base URL used by `src/lib/api.js`. Empty value = same-origin requests. |
| `PROXY_TARGET` (server-side, `vite.config.js`) | *(unset)* | When set (e.g. `http://127.0.0.1:3001`), the dev server forwards `/api` and `/health` to that target — for environments where the browser cannot reach the backend directly. It only forwards requests; the frontend **never starts backend services**. |

The backend's `CORS_ORIGIN` must include the frontend origin
(`http://localhost:5173` by default).

## End-to-end workflow implemented

1. **New Decision** form → `POST /api/decisions` (validated, saved).
2. Backend → `POST /api/decisions/:id/predictions` → FastAPI `POST /predict`
   with **exactly the seven decision-time features** (ids, dates,
   observation windows and outcome labels are never sent).
3. FastAPI runs the trained pipeline and returns a genuine probability +
   predicted class + disclaimer; the backend persists the validated response.
4. React shows the Prediction Results view with the returned probability,
   predicted class/label, decision summary and the model's disclaimer.
5. **Decision History** loads saved rows via `GET /api/decisions`
   (server pagination) and records outcomes via
   `POST /api/decisions/:id/outcomes` — `unknown` stays `unknown` (no date,
   never converted to `not_reversed`).
6. Failures are honest: if FastAPI/model is down nothing is saved or shown;
   if PostgreSQL/Express is down the UI shows the error and never falls back
   to demo data.

## Tests

```bash
# Frontend — component/integration tests (Vitest + Testing Library)
cd frontend && npm test
cd frontend && npm run lint && npm run build

# Backend — validation, ML client, HTTP API, live PostgreSQL
cd backend && npm test

# ML — preprocessing, training, FastAPI contract
cd ml && ../.venv/bin/python -m pytest tests/ -v
```

Backend live-DB tests use a disposable embedded PostgreSQL 17 unless you set
`TEST_DATABASE_URL` to a **dedicated, disposable** test database:

```powershell
$env:TEST_DATABASE_URL = "postgresql://user:pw@127.0.0.1:5432/drp_test"
npm test
```

## Current limitations (honest status)

- **No authentication.** Login/register screens are placeholders; the API is
  unauthenticated and local-development only.
- **Historical CSV upload is validation + preview only.** The file is parsed
  in the browser, never uploaded, never stored in PostgreSQL and never used
  to train the model. Unknown outcome labels stay unknown (never `0`).
- **The model is experimental** — trained on a small synthetic dataset
  (39 labelled rows); its metrics are not accuracy claims.
- **No risk levels, SHAP explanations, contributing factors or confidence
  intervals** are produced by any layer; the API returns only a probability,
  a predicted class and the disclaimer.
- Observation windows (180/365 days) from the ML dataset are not tracked for
  saved decisions, so recorded `not_reversed` outcomes are provisional.
