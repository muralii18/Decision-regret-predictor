-- Decision Regret Predictor — initial schema.
-- Applied by src/db/migrate.js inside a transaction and recorded in
-- schema_migrations. Idempotent only via the migration runner, not here.

-- Categories/confidence: keep in sync with the frontend New Decision form
-- (frontend/src/components/NewDecisionForm.jsx) and the ML schema
-- (ml/preprocessing/preprocess.py VALID_CATEGORIES / VALID_CONFIDENCE_LEVELS).

CREATE TABLE decisions (
    id                    BIGSERIAL PRIMARY KEY,
    -- Application metadata (never sent to the ML service) is kept apart from
    -- the seven decision-time ML features below.
    title                 TEXT NOT NULL CHECK (length(trim(title)) >= 3),
    decision_date         DATE NOT NULL DEFAULT CURRENT_DATE CHECK (decision_date <= CURRENT_DATE),
    -- The seven decision-time ML features:
    category              TEXT NOT NULL
        CHECK (category IN ('Hiring', 'Supplier Selection', 'Project Approval',
                            'Equipment Purchase', 'Product Launch', 'Technology Selection')),
    estimated_cost_usd    DOUBLE PRECISION NOT NULL CHECK (estimated_cost_usd > 0),
    num_alternatives      INTEGER NOT NULL CHECK (num_alternatives >= 0),
    confidence_level      TEXT NOT NULL CHECK (confidence_level IN ('Low', 'Medium', 'High')),
    business_context      TEXT NOT NULL CHECK (length(trim(business_context)) >= 10),
    expected_benefits     TEXT NOT NULL CHECK (length(trim(expected_benefits)) >= 10),
    identified_risks      TEXT NOT NULL CHECK (length(trim(identified_risks)) >= 10),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX decisions_created_at_idx ON decisions (created_at DESC, id DESC);

-- One current outcome per decision (record-or-update semantics).
-- 'unknown' is a first-class state: an unknown outcome is NEVER stored as
-- 'not_reversed'.
CREATE TABLE decision_outcomes (
    id            BIGSERIAL PRIMARY KEY,
    decision_id   BIGINT NOT NULL UNIQUE REFERENCES decisions (id) ON DELETE CASCADE,
    outcome       TEXT NOT NULL CHECK (outcome IN ('reversed', 'not_reversed', 'unknown')),
    outcome_date  DATE,
    note          TEXT CHECK (note IS NULL OR length(note) <= 200),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A known outcome must carry a date; an unknown one may keep it open.
    CHECK (
        (outcome = 'unknown' AND outcome_date IS NULL)
        OR (outcome <> 'unknown' AND outcome_date IS NOT NULL)
    )
);

CREATE INDEX decision_outcomes_decision_id_idx ON decision_outcomes (decision_id);

-- Persisted results of genuine FastAPI /predict responses only.
CREATE TABLE predictions (
    id                      BIGSERIAL PRIMARY KEY,
    decision_id             BIGINT NOT NULL REFERENCES decisions (id) ON DELETE CASCADE,
    probability_of_reversal DOUBLE PRECISION NOT NULL
        CHECK (probability_of_reversal >= 0 AND probability_of_reversal <= 1),
    probability_percent     DOUBLE PRECISION NOT NULL
        CHECK (probability_percent >= 0 AND probability_percent <= 100),
    predicted_class         SMALLINT NOT NULL CHECK (predicted_class IN (0, 1)),
    predicted_label         TEXT NOT NULL CHECK (predicted_label IN ('Reversed', 'Not reversed')),
    threshold               DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    dataset                 TEXT NOT NULL DEFAULT 'synthetic',
    disclaimer              TEXT,
    -- The exact JSON the ML service returned (synthetic-data disclaimer
    -- preserved verbatim); never fabricated by this backend.
    provider_response       JSONB NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX predictions_decision_id_idx ON predictions (decision_id DESC, created_at DESC);
