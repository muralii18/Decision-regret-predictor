"""FastAPI service for the Decision Regret Predictor ML API.

Loads the trained scikit-learn pipeline produced by ``training/train.py``
(``models/regret_risk_model.joblib``, git-ignored — train it locally if it
is missing) and serves reversal-risk estimates from it.

Honesty and safety rules:
  * Importing or starting this service NEVER trains a model; it only loads
    an existing artifact, lazily and with a cache.
  * The model path is resolved from this file's location, never from the
    process working directory.
  * The reversal probability is the classifier's probability for class 1
    (``target_reversed = 1``); the class ordering is read from the fitted
    classifier (``classes_``), not assumed.
  * No risk levels, thresholds-of-convenience, contributing factors,
    SHAP explanations, confidence intervals or accuracy claims are produced.
  * If the artifact is missing or unreadable the client receives a generic
    503 with no local paths, stack traces or internal exception details.
"""

import logging
import threading
from pathlib import Path
from typing import Any, Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

# Import constraints from the single source of truth (preprocessing module).
# NOTE: never import training.* here — the prediction service must not train.
from preprocessing.preprocess import (
    FEATURE_COLUMNS,
    VALID_CATEGORIES,
    VALID_CONFIDENCE_LEVELS,
)

logger = logging.getLogger("decision-regret-predictor.prediction")

# Resolved relative to THIS file (ml/prediction/), not the cwd.
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "regret_risk_model.joblib"

MISSING_MODEL_DETAIL = (
    "The model is not available on this server. Train it first (see "
    "ml/README.md) and retry. No prediction can be produced."
)
INVALID_MODEL_DETAIL = (
    "The model artifact could not be loaded. No prediction can be produced; "
    "retraining is required (see ml/README.md)."
)
PREDICTION_FAILED_DETAIL = "Prediction failed. No result can be produced."

DISCLAIMER = (
    "Experimental prototype: the model was trained on a small synthetic "
    "dataset (39 labelled rows) and is not evidence of accuracy or "
    "production readiness. A probability is an estimate, not a guarantee of "
    "the real outcome. No risk level, contributing factors or confidence "
    "interval is provided."
)

app = FastAPI(
    title="Decision Regret Predictor — ML Service",
    description=(
        "Estimates the probability that a decision will be reversed, using "
        "the trained scikit-learn pipeline. Experimental — trained on a "
        "small synthetic dataset."
    ),
    version="0.1.0",
)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class PredictionRequest(BaseModel):
    """Exactly the seven decision-time features, with the same constraints
    the preprocessing validation enforces (see preprocessing/preprocess.py).

    ``extra='forbid'`` rejects outcome/context columns (decision_id,
    decision_date, observation_window_days, target_reversed, ...) so nothing
    outside the legitimate feature set can reach the model.
    """

    model_config = ConfigDict(extra="forbid")

    category: Literal[tuple(VALID_CATEGORIES)]
    estimated_cost_usd: float = Field(gt=0, description="Planned cost known at decision time (USD), > 0")
    num_alternatives: int = Field(ge=0, description="Alternatives considered at decision time, >= 0")
    confidence_level: Literal[tuple(VALID_CONFIDENCE_LEVELS)]
    business_context: str = Field(min_length=1, description="Context known at decision time")
    expected_benefits: str = Field(min_length=1, description="Benefits expected at decision time")
    identified_risks: str = Field(min_length=1, description="Risks identified at decision time")

    @field_validator("business_context", "expected_benefits", "identified_risks")
    @classmethod
    def _reject_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be empty or whitespace-only")
        return value


class PredictionResponse(BaseModel):
    probability_of_reversal: float = Field(
        description="P(target_reversed = 1), between 0 and 1"
    )
    probability_percent: float = Field(
        description="Same probability as a percentage, 0-100"
    )
    predicted_class: int = Field(
        description="Model's binary decision at the classifier's own 0.5 threshold: 1 = reversed, 0 = not reversed"
    )
    predicted_label: str = Field(description="Human-readable form of predicted_class")
    threshold: float = Field(description="Decision threshold used for predicted_class")
    dataset: str = Field(description="Dataset the model was trained on")
    disclaimer: str = Field(description="Honesty disclaimer about the experimental model")


# ---------------------------------------------------------------------------
# Lazy, cached model loading (never trains)
# ---------------------------------------------------------------------------

_PIPELINE_CACHE: Any = None
_PIPELINE_LOCK = threading.Lock()


class ModelUnavailableError(RuntimeError):
    """The artifact is missing or unreadable; the client gets a safe 503."""


def reset_model_cache() -> None:
    """Forget the cached pipeline (used by tests and operational reloads)."""
    global _PIPELINE_CACHE
    with _PIPELINE_LOCK:
        _PIPELINE_CACHE = None


def get_pipeline() -> Any:
    """Load and cache the fitted Pipeline from MODEL_PATH.

    Raises ModelUnavailableError (never a raw exception with internals) when
    the artifact is missing, unreadable or not a fitted classifier pipeline.
    """
    global _PIPELINE_CACHE
    if _PIPELINE_CACHE is not None:
        return _PIPELINE_CACHE
    with _PIPELINE_LOCK:
        if _PIPELINE_CACHE is not None:
            return _PIPELINE_CACHE
        if not MODEL_PATH.is_file():
            logger.warning("Model artifact not found at configured path")
            raise ModelUnavailableError(MISSING_MODEL_DETAIL)
        try:
            pipe = joblib.load(MODEL_PATH)
        except Exception:
            # Full traceback goes to server logs only, never to the client.
            logger.exception("Failed to load model artifact")
            raise ModelUnavailableError(INVALID_MODEL_DETAIL) from None
        if not hasattr(pipe, "predict_proba") or not hasattr(pipe, "classes_"):
            logger.error("Loaded artifact is not a fitted classifier pipeline")
            raise ModelUnavailableError(INVALID_MODEL_DETAIL)
        _PIPELINE_CACHE = pipe
        return pipe


def model_available() -> bool:
    """Whether a usable pipeline can be loaded right now (never raises)."""
    try:
        get_pipeline()
        return True
    except ModelUnavailableError:
        return False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/")
def root() -> dict:
    """Service information."""
    return {
        "service": "decision-regret-predictor-ml",
        "status": "ok",
        "model_loaded": model_available(),
        "message": (
            "Prediction API. A prediction requires the trained pipeline "
            "artifact (see ml/README.md to train it)."
        ),
    }


@app.get("/health")
def health() -> dict:
    """Health check; reports whether the trained model is loadable."""
    loaded = model_available()
    return {
        "status": "ok",
        "model_loaded": loaded,
        "detail": (
            "Service is reachable and the trained model is loaded."
            if loaded
            else "Service is reachable, but no trained model artifact is "
            "available; /predict returns 503 until one is trained."
        ),
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest) -> PredictionResponse:
    """Estimate P(decision reversed) from the trained pipeline.

    422 — request body fails validation (missing/malformed/unsupported
          values), handled by FastAPI/Pydantic.
    503 — the model artifact is missing or cannot be loaded; no probability
          is ever fabricated in that case.
    """
    try:
        pipe = get_pipeline()
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None

    try:
        # Confirm the class ordering from the fitted classifier instead of
        # assuming probability column 1 means class 1.
        classes = list(pipe.classes_)
        if 1 not in classes:
            logger.error("Fitted classifier has no class 1; artifact is invalid")
            raise ModelUnavailableError(INVALID_MODEL_DETAIL)
        class_1_index = classes.index(1)

        # One-row frame with exactly the seven features, canonical order.
        row = {col: getattr(request, col) for col in FEATURE_COLUMNS}
        X = pd.DataFrame([row], columns=FEATURE_COLUMNS)

        probability = float(pipe.predict_proba(X)[0, class_1_index])
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    except HTTPException:
        raise
    except Exception:
        # Internals (paths, exception text) go to server logs only.
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=PREDICTION_FAILED_DETAIL) from None

    if not (0.0 <= probability <= 1.0) or probability != probability:
        logger.error("Model produced an out-of-range probability")
        raise HTTPException(status_code=500, detail=PREDICTION_FAILED_DETAIL)

    predicted_class = 1 if probability >= 0.5 else 0
    return PredictionResponse(
        probability_of_reversal=probability,
        probability_percent=round(probability * 100.0, 2),
        predicted_class=predicted_class,
        predicted_label="Reversed" if predicted_class == 1 else "Not reversed",
        threshold=0.5,
        dataset="synthetic",
        disclaimer=DISCLAIMER,
    )
