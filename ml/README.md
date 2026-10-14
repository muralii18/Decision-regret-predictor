# Decision Regret Predictor — ML Service

Python machine-learning service for estimating the risk that a decision
will be reversed in the future.

## Status

**Training pipeline + prediction API implemented (experimental).** A small
**synthetic** dataset exists for pipeline prototyping, a baseline
logistic-regression pipeline can be trained (see Training below), and the
FastAPI service serves real probabilities from the saved artifact via
`POST /predict` (see Prediction API). The dataset and every metric derived
from it are experimental — they are not evidence of accuracy.

## Layout

```
ml/
├── data/
│   ├── generate_synthetic.py   # deterministic SYNTHETIC data generator
│   ├── raw/          # raw records (ignored by git; synthetic v1 is tracked)
│   └── processed/    # cleaned/encoded datasets (ignored by git)
├── models/           # serialized model artifacts (ignored by git)
├── preprocessing/    # data loading, cleaning, encoding, splitting
├── training/         # baseline training pipeline (train.py)
├── prediction/       # FastAPI service (serves the trained pipeline)
├── tests/            # pytest tests (preprocessing, training, API)
├── requirements.txt
└── README.md
```

## Environment

A shared virtual environment lives at the **project root**: `../.venv`
(created because none existed; ignored by the root `.gitignore`).

```bash
# from the repository root
python3 -m venv .venv            # already done
.venv/bin/pip install -r ml/requirements.txt   # already done
```

## Run the API

Train the model first if `models/regret_risk_model.joblib` does not exist
(the artifact is git-ignored; `/predict` returns `503` without it).

```bash
# Linux / macOS (from the repository root)
.venv/bin/python ml/training/train.py          # train -> models/regret_risk_model.joblib
cd ml
../.venv/bin/uvicorn prediction.main:app --reload
# interactive docs: http://127.0.0.1:8000/docs
```

Windows PowerShell (do not use Unix `source`/`activate` syntax here — call
the venv executables directly, or activate with `.\.venv\Scripts\Activate.ps1`):

```powershell
# from the repository root
.\.venv\Scripts\python.exe ml\training\train.py
cd ml
..\.venv\Scripts\uvicorn.exe prediction.main:app --reload
# interactive docs: http://127.0.0.1:8000/docs
```

## Tests

```bash
# Linux / macOS
cd ml && ../.venv/bin/python -m pytest tests/ -v

# Windows PowerShell
cd ml; ..\.venv\Scripts\python.exe -m pytest tests/ -v
```

## Dataset

`data/raw/decisions_synthetic_v1.csv` — 42 records, generated
deterministically by `data/generate_synthetic.py` (seed `20261010`).

> **SYNTHETIC DATA — NOT REAL ORGANIZATIONAL EVIDENCE.**
> Every record is fabricated for interface and pipeline testing. The values,
> texts and outcomes must never be presented as decisions made by a real
> organization, and model behaviour learned from this file says nothing
> about real-world regret risk.

### Schema

| Column | Type | Role | Description |
|---|---|---|---|
| `decision_id` | string | context | Unique record id (`DRP-0001`…) |
| `decision_date` | date (ISO) | context | When the decision was made |
| `category` | enum | **feature** | Hiring, Supplier Selection, Project Approval, Equipment Purchase, Product Launch, Technology Selection |
| `estimated_cost_usd` | number | **feature** | Planned cost known at decision time (USD) |
| `num_alternatives` | integer | **feature** | Alternatives considered at decision time |
| `confidence_level` | enum | **feature** | Decision maker's confidence: Low / Medium / High |
| `business_context` | text | **feature** | Context known at decision time |
| `expected_benefits` | text | **feature** | Benefits expected at decision time |
| `identified_risks` | text | **feature** | Risks identified at decision time |
| `observation_window_days` | integer | outcome metadata | Window (180 or 365 days) over which reversal status was assessed — **not a model input** |
| `target_reversed` | 1 / 0 / empty | **target** | Outcome label (defined below) |

### Target definition

- `target_reversed = 1` — the decision **was reversed** within its
  `observation_window_days` window.
- `target_reversed = 0` — the decision was **not reversed within** that window.
- `target_reversed` empty (3 rows) — **outcome unknown** because the window is
  still open. Unknown rows **must be dropped before training and must never be
  relabelled as 0**.

### Leakage rule

Only the seven **feature** columns above are legitimate model inputs: they are
all information that existed when the decision was made. `decision_date`,
`observation_window_days` and `target_reversed` describe outcome assessment and
must not be fed to the model as predictors.

### Limitations

- **42 rows is a toy dataset** — enough to exercise preprocessing, training and
  API wiring, far too small to support any real-world claim.
- Entirely synthetic; correlations in it (e.g. cost/confidence vs reversal)
  are assumptions baked into the generator, not empirical findings.
- Free-text fields are template-generated English sentences, not real business
  writing.
- Only the six form categories; real deployments will need broader coverage
  and, eventually, real de-identified records with appropriate consent.
- The only evaluation protocol is the small chronological holdout described
  below — no cross-validation or external test set exists yet.

## Preprocessing (implemented)

`preprocessing/preprocess.py` — runs end to end with
`../.venv/bin/python ml/preprocessing/preprocess.py` (path-independent: the
CSV location is derived from `__file__`, not the working directory).

Behaviour:

- **Validation** — checks the exact 11-column schema, non-empty required
  fields, the six allowed categories, Low/Medium/High confidence, positive
  costs, non-negative integer alternatives, parseable non-future dates,
  observation windows in {180, 365}, and target values in {0, 1, empty}.
  Any violation raises `ValueError` with the specific problem.
- **Unknown outcomes** — rows with an empty `target_reversed` (3 of 42) are
  **dropped** before learning; they are never converted to 0.
- **Features** — only the seven decision-time columns are used:
  `category`, `estimated_cost_usd`, `num_alternatives`, `confidence_level`,
  `business_context`, `expected_benefits`, `identified_risks`.
  `decision_id`, `decision_date`, `observation_window_days` and
  `target_reversed` are excluded by construction (`remainder='drop'`).
- **Transformations (scikit-learn `ColumnTransformer`)** —
  median-impute + `StandardScaler` for numerics, `OneHotEncoder
  (handle_unknown='ignore')` for category/confidence, and per-column
  `TfidfVectorizer` for the three text fields. The transformer is **fit on the
  training split only**; validation is transformed with the fitted object.
- **Split** — reproducible **chronological** split: rows sorted by
  `decision_date` (ties broken by `decision_id`), oldest 75 % → train,
  newest 25 % → validation. No randomness, no random-split fallback.

Actual counts on the synthetic v1 dataset (39 labelled rows):

| Split | Rows | Reversed (1) | Not reversed (0) |
|---|---|---|---|
| Train (oldest) | 29 | 11 | 18 |
| Validation (newest) | 10 | 5 | 5 |

**Split limitations:** with only 39 labelled rows the validation set is 10
rows — any metric computed on it will have very high variance, and one
chronological block cannot represent seasonal or distribution shift. Always
report these counts next to any future evaluation; never quote a metric
without them.

## Training (implemented)

`training/train.py` — trains a baseline classifier and saves **one** fitted
scikit-learn `Pipeline` (preprocessing + classifier) so training and
inference always share exactly the same transformers.

```bash
# from the repository root
.venv/bin/python ml/training/train.py

# or from ml/
../.venv/bin/python training/train.py
```

(The script derives all paths from `__file__`, so it works from any working
directory. Importing `training.train` never runs training — only executing
the file as a script does.)

What it does, in order:

1. **Load + validate** via `preprocessing/preprocess.py` (same strict schema
   rules as everything else).
2. **Drop unknown outcomes** — only rows with `target_reversed` = 0 or 1 are
   trained on; empty labels are excluded and never converted to 0.
3. **Reproducible chronological split** (existing preprocessing): oldest
   75 % → train (29 rows), newest 25 % → holdout (10 rows), ties broken by
   `decision_id`. No randomness, so repeated runs produce the identical
   split. Both partitions contain both classes (train 11/18, holdout 5/5),
   so a stratified random split was not needed; a chronological split also
   avoids training on the future.
4. **Fit preprocessing on the training split only** inside the Pipeline
   (median-impute + scale numerics, one-hot category/confidence, per-column
   TF-IDF on the three text fields, `remainder='drop'`).
5. **Baseline classifier** — `LogisticRegression(class_weight='balanced',
   max_iter=5000, random_state=42)`. (A good baseline for the 461 sparse
   TF-IDF/one-hot features and 29 training rows; tree ensembles overfit at
   this size.)
6. **Evaluate** on the chronological holdout at threshold 0.5 and print
   accuracy, precision, recall, F1 and the confusion matrix — always with
   counts and caveats, never as an accuracy claim.
7. **Save** the whole Pipeline with joblib.

### Model artifact

| | |
|---|---|
| **Path** | `ml/models/regret_risk_model.joblib` (stable, documented) |
| Contents | one `Pipeline` with steps `preprocess` → `classifier` |
| Tracked in git? | **No** — `ml/.gitignore` excludes `models/*.joblib` by repository convention |
| Regenerate | run the training command above; it overwrites the artifact |

### Evaluation on synthetic v1 (EXPERIMENTAL)

Holdout = the 10 newest labelled decisions (5 reversed, 5 not reversed),
threshold 0.5:

| Metric | Value |
|---|---|
| Accuracy | 0.800 |
| Precision | 0.714 |
| Recall | 1.000 |
| F1 | 0.833 |
| Confusion matrix `[[TN, FP], [FN, TP]]` | `[[3, 2], [0, 5]]` |

> **These numbers are not a quality claim.** They are computed from 10
> synthetic holdout rows generated by the same script that wrote the
> training data. The metrics describe the generator's baked-in assumptions,
> have extremely high variance, and are **not** evidence that the model is
> accurate or production-ready. Always quote them together with the counts
> above and the word *synthetic*.

Reproduce with `../.venv/bin/python training/train.py` — training is
deterministic (`random_state=42`, fixed split), so repeated runs report the
identical metrics.

## Prediction API (implemented)

`prediction/main.py` serves the trained pipeline. It **never trains**: the
artifact (`models/regret_risk_model.joblib`, path resolved from the source
file, not the cwd) is loaded lazily on first use and cached. Importing or
starting the service does not create, retrain or overwrite any file.

### `POST /predict`

Request body — exactly the seven decision-time features, with the same
constraints preprocessing enforces (the six categories, Low/Medium/High
confidence, cost > 0, non-negative integer alternatives, non-empty texts).
Unknown fields — including `target_reversed`, `decision_id`,
`decision_date` and `observation_window_days` — are rejected (422), so
outcome information can never reach the model through the API.

```json
{
  "category": "Supplier Selection",
  "estimated_cost_usd": 250000.0,
  "num_alternatives": 4,
  "confidence_level": "Medium",
  "business_context": "Selected a new logistics vendor ahead of a contract renewal deadline.",
  "expected_benefits": "Lower per-unit shipping cost and faster delivery times.",
  "identified_risks": "Migration effort and single-provider dependency."
}
```

Response (`200`) — the probability is the classifier's probability for
class 1 (`target_reversed = 1`); the column is resolved through the fitted
classifier's `classes_` ordering, not assumed:

```json
{
  "probability_of_reversal": 0.3431,
  "probability_percent": 34.31,
  "predicted_class": 0,
  "predicted_label": "Not reversed",
  "threshold": 0.5,
  "dataset": "synthetic",
  "disclaimer": "Experimental prototype: the model was trained on a small synthetic dataset (39 labelled rows) and is not evidence of accuracy or production readiness. A probability is an estimate, not a guarantee of the real outcome. No risk level, contributing factors or confidence interval is provided."
}
```

`predicted_class` is the classifier's own binary decision at its default
0.5 threshold — **not** a risk level. The API deliberately returns no risk
classification, contributing factors, SHAP values, confidence intervals or
accuracy claims.

Errors:

| Status | When | Body |
|---|---|---|
| `422` | Missing, malformed or unsupported fields (FastAPI/Pydantic) | `detail` list of field errors |
| `503` | Model artifact missing or unreadable — **no probability is ever fabricated** | generic `detail`, no local paths, stack traces or exception text |
| `500` | Prediction itself failed unexpectedly | generic `detail` only |

`GET /health` and `GET /` stay up in every case and report
`model_loaded: true|false`. Interactive docs at `/docs`.

### Tests

60 tests (26 preprocessing, 16 training, 15 API, 3 service) cover schema
validation, unknown-outcome exclusion, feature/target separation,
deterministic chronological splitting, leakage prevention (encoders proven
to be fit on training data only — including on the **saved artifact**),
deterministic training, reload of the saved pipeline with finite
probabilities in [0, 1], recomputation of reported metrics, useful errors
for small/invalid/single-class datasets, import safety (training never runs
when `training.train` or the prediction service is imported), and — for the
API — end-to-end requests against an **isolated temporary model** (the
trained artifact is not required to run the suite): valid requests match
the saved pipeline's own class-1 probability, the class column follows
`classifier.classes_`, missing/malformed/unsupported fields and leaked
outcome columns return 422, and missing/corrupt/non-pipeline artifacts
return a path-free 503 without any fabricated probability.

## Next step

1. ~~Define and collect a historical decision dataset~~ — done (synthetic
   v1, see Dataset section); real, de-identified records come later.
2. ~~Implement `preprocessing/preprocess.py`~~ — done (see Preprocessing
   section).
3. ~~Implement `training/train.py`~~ — done (see Training section); metrics
   are experimental because the dataset is synthetic and tiny.
4. ~~Wire the saved pipeline into `prediction/main.py`~~ — done (see
   Prediction API section).
5. Grow the dataset (real, de-identified records) before making any claim
   about model quality; add cross-validation once row counts allow it.
6. Next project step: the Node.js/Express + PostgreSQL backend that stores
   decisions and calls this ML service (frontend stays unchanged).
