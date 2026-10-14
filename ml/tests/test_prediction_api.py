"""End-to-end API tests for POST /predict using an isolated temporary model.

The trained artifact is git-ignored and may not exist on another machine, so
every test here trains (or stubs) its own model in a temp directory and
points the service at it. No test asserts model quality — only wiring,
validation, safety and honesty rules.
"""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import prediction.main as prediction_main
from prediction.main import DISCLAIMER, FEATURE_COLUMNS
from training.train import train

VALID_PAYLOAD = {
    "category": "Supplier Selection",
    "estimated_cost_usd": 250_000.0,
    "num_alternatives": 4,
    "confidence_level": "Medium",
    "business_context": (
        "Selected a new logistics vendor ahead of a contract renewal deadline."
    ),
    "expected_benefits": "Lower per-unit shipping cost and faster delivery times.",
    "identified_risks": "Migration effort and single-provider dependency.",
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def model_artifact(tmp_path_factory):
    """An isolated trained pipeline produced by the Step 2 trainer."""
    out = tmp_path_factory.mktemp("api_model") / "model.joblib"
    return Path(train(model_path=out)["model_path"])


def _point_service_at(monkeypatch, model_path):
    monkeypatch.setattr(prediction_main, "MODEL_PATH", Path(model_path))
    prediction_main.reset_model_cache()


@pytest.fixture()
def client(monkeypatch, model_artifact):
    _point_service_at(monkeypatch, model_artifact)
    with TestClient(prediction_main.app) as c:
        yield c
    prediction_main.reset_model_cache()


@pytest.fixture()
def client_missing_model(monkeypatch, tmp_path):
    _point_service_at(monkeypatch, tmp_path / "missing.joblib")
    with TestClient(prediction_main.app) as c:
        yield c
    prediction_main.reset_model_cache()


def _one_row(payload):
    return pd.DataFrame(
        [{c: payload[c] for c in FEATURE_COLUMNS}], columns=FEATURE_COLUMNS
    )


# ---------------------------------------------------------------------------
# Valid requests go through the real saved pipeline
# ---------------------------------------------------------------------------

def test_valid_request_uses_saved_pipeline(client, model_artifact):
    resp = client.post("/predict", json=VALID_PAYLOAD)
    assert resp.status_code == 200
    body = resp.json()

    # Recompute from the same artifact the service loads: the API probability
    # must be the pipeline's own class-1 probability, nothing else.
    pipe = joblib.load(model_artifact)
    classes = list(pipe.classes_)
    expected = float(pipe.predict_proba(_one_row(VALID_PAYLOAD))[0, classes.index(1)])
    assert body["probability_of_reversal"] == pytest.approx(expected)


def test_probability_is_finite_and_bounded(client):
    body = client.post("/predict", json=VALID_PAYLOAD).json()
    p = body["probability_of_reversal"]
    assert np.isfinite(p)
    assert 0.0 <= p <= 1.0
    assert body["probability_percent"] == pytest.approx(p * 100.0, abs=0.01)


def test_predicted_class_is_the_models_own_binary_decision(client):
    body = client.post("/predict", json=VALID_PAYLOAD).json()
    assert body["predicted_class"] in (0, 1)
    assert body["predicted_label"] == (
        "Reversed" if body["predicted_class"] == 1 else "Not reversed"
    )
    assert body["predicted_class"] == (1 if body["probability_of_reversal"] >= 0.5 else 0)


def test_probability_column_follows_classifier_classes_not_assumption(monkeypatch):
    """The class-1 column is resolved via classifier.classes_, not hardcoded."""

    class StubPipeline:
        def __init__(self, classes, probabilities):
            self.classes_ = np.array(classes)
            self._probs = probabilities

        def predict_proba(self, X):
            return np.array(self._probs)

    # classes_ = [1, 0] (never produced by sklearn, but proves the mapping):
    # column 0 belongs to class 1, so the API must return 0.9, not 0.1.
    monkeypatch.setattr(
        prediction_main, "_PIPELINE_CACHE", StubPipeline([1, 0], [[0.9, 0.1]])
    )
    with TestClient(prediction_main.app) as c:
        body = c.post("/predict", json=VALID_PAYLOAD).json()
    assert body["probability_of_reversal"] == pytest.approx(0.9)

    # Control: standard [0, 1] ordering picks column 1.
    monkeypatch.setattr(
        prediction_main, "_PIPELINE_CACHE", StubPipeline([0, 1], [[0.9, 0.1]])
    )
    with TestClient(prediction_main.app) as c:
        body = c.post("/predict", json=VALID_PAYLOAD).json()
    assert body["probability_of_reversal"] == pytest.approx(0.1)


# ---------------------------------------------------------------------------
# Validation: malformed / incomplete / unsupported input -> 422
# ---------------------------------------------------------------------------

def test_missing_required_field_returns_422(client):
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "category"}
    assert client.post("/predict", json=payload).status_code == 422


def test_malformed_values_return_422(client):
    bad_values = [
        ("estimated_cost_usd", "lots of money"),   # not numeric
        ("estimated_cost_usd", -5),                # preprocess requires > 0
        ("estimated_cost_usd", 0),                 # preprocess requires > 0
        ("num_alternatives", -1),                  # non-negative required
        ("num_alternatives", 2.5),                 # integer required
        ("confidence_level", "Very Sure"),         # enum: Low/Medium/High
    ]
    for field, value in bad_values:
        resp = client.post("/predict", json={**VALID_PAYLOAD, field: value})
        assert resp.status_code == 422, f"{field}={value!r} should be rejected"


def test_unsupported_category_returns_422(client):
    resp = client.post("/predict", json={**VALID_PAYLOAD, "category": "Picking Lunch"})
    assert resp.status_code == 422


def test_blank_text_fields_return_422(client):
    # Mirrors preprocessing: empty/whitespace-only text is invalid.
    for field in ("business_context", "expected_benefits", "identified_risks"):
        resp = client.post("/predict", json={**VALID_PAYLOAD, field: "   "})
        assert resp.status_code == 422, f"{field} should reject blank text"


def test_outcome_and_context_columns_are_rejected(client):
    # extra='forbid': nothing outside the seven decision-time features may
    # reach the model — leakage guard at the API boundary.
    for extra in ("target_reversed", "decision_id", "decision_date",
                  "observation_window_days", "probability_of_reversal"):
        resp = client.post("/predict", json={**VALID_PAYLOAD, extra: "x"})
        assert resp.status_code == 422, f"extra field {extra} should be rejected"


# ---------------------------------------------------------------------------
# Missing / invalid artifacts fail safely — never a fabricated probability
# ---------------------------------------------------------------------------

def test_missing_model_returns_safe_503(client_missing_model, tmp_path):
    resp = client_missing_model.post("/predict", json=VALID_PAYLOAD)
    assert resp.status_code == 503
    body = resp.json()
    assert "not available" in body["detail"].lower()
    # No probability is fabricated, and no local paths or internals leak.
    assert "probability_of_reversal" not in body
    assert str(tmp_path) not in resp.text
    assert "Traceback" not in resp.text
    assert ".joblib" not in resp.text


def test_health_and_root_still_work_without_model(client_missing_model):
    health_body = client_missing_model.get("/health").json()
    assert health_body["status"] == "ok"
    assert health_body["model_loaded"] is False

    root_body = client_missing_model.get("/").json()
    assert root_body["status"] == "ok"
    assert root_body["model_loaded"] is False


def test_corrupt_artifact_returns_safe_503(monkeypatch, tmp_path):
    bogus = tmp_path / "corrupt.joblib"
    bogus.write_bytes(b"this is not a joblib file")
    _point_service_at(monkeypatch, bogus)
    with TestClient(prediction_main.app) as c:
        resp = c.post("/predict", json=VALID_PAYLOAD)
        assert resp.status_code == 503
        assert "probability_of_reversal" not in resp.json()
        assert str(tmp_path) not in resp.text
        assert "Traceback" not in resp.text
    prediction_main.reset_model_cache()


def test_non_pipeline_artifact_returns_safe_503(monkeypatch, tmp_path):
    not_a_model = tmp_path / "dict.joblib"
    joblib.dump({"not": "a pipeline"}, not_a_model)
    _point_service_at(monkeypatch, not_a_model)
    with TestClient(prediction_main.app) as c:
        resp = c.post("/predict", json=VALID_PAYLOAD)
        assert resp.status_code == 503
        assert "probability_of_reversal" not in resp.json()
    prediction_main.reset_model_cache()


# ---------------------------------------------------------------------------
# Import/startup safety and honesty of the response
# ---------------------------------------------------------------------------

def test_startup_never_trains_or_writes_artifacts(monkeypatch, tmp_path):
    target_dir = tmp_path / "models"
    target_dir.mkdir()
    _point_service_at(monkeypatch, target_dir / "regret_risk_model.joblib")
    with TestClient(prediction_main.app) as c:
        assert c.get("/health").json()["model_loaded"] is False
        assert c.post("/predict", json=VALID_PAYLOAD).status_code == 503
    # Nothing was trained, written or fabricated at import/startup time.
    assert list(target_dir.iterdir()) == []
    prediction_main.reset_model_cache()


def test_response_is_honest_and_invents_nothing(client):
    body = client.post("/predict", json=VALID_PAYLOAD).json()
    assert body["dataset"] == "synthetic"
    assert "synthetic" in body["disclaimer"].lower()
    assert "estimate, not a guarantee" in body["disclaimer"]
    assert body["disclaimer"] == DISCLAIMER
    invented = ("contributing_factors", "factors", "risk_level", "shap",
                "confidence_interval", "accuracy")
    assert not any(key in body for key in invented)
