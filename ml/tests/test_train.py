"""Tests for ml/training/train.py.

Covers: unknown-label exclusion, feature/target separation in the SAVED
artifact, preprocessing fitted on training data only, deterministic training,
pipeline reload with valid probabilities, useful failures on small/invalid
data, and import safety (training never runs as a side effect of imports).

No test asserts accuracy: the dataset is synthetic, tiny, and the metrics are
reported with counts and caveats rather than as quality claims.
"""

import inspect
import subprocess
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import accuracy_score, confusion_matrix

from preprocessing.preprocess import (
    EXPECTED_COLUMNS,
    EXCLUDED_FROM_FEATURES,
    FEATURE_COLUMNS,
    NUMERIC_FEATURES,
    VALID_CATEGORIES,
    chronological_split,
    keep_supervised_rows,
    load_raw_data,
    validate_dataset,
)
from training import train as train_module
from training.train import MODEL_PATH, train

ML_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def base_row(i=0, **overrides):
    """One fully valid row; override fields per test (mirrors test_preprocess)."""
    row = {
        "decision_id": f"TST-{i:04d}",
        "decision_date": (pd.Timestamp("2025-01-01") + pd.Timedelta(days=i)).date().isoformat(),
        "category": list(VALID_CATEGORIES)[i % len(VALID_CATEGORIES)],
        "estimated_cost_usd": 50_000 + 1_000 * i,
        "num_alternatives": 2,
        "confidence_level": "Medium",
        "business_context": f"Context number {i}.",
        "expected_benefits": f"Benefit number {i}.",
        "identified_risks": f"Risk number {i}.",
        "observation_window_days": 180,
        "target_reversed": i % 2,
    }
    row.update(overrides)
    return row


def write_csv(tmp_path, rows, name="data.csv"):
    """Write rows (or header-only) as a schema-canonical CSV."""
    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=EXPECTED_COLUMNS)
    df = df[EXPECTED_COLUMNS]
    path = tmp_path / name
    df.to_csv(path, index=False)
    return path


@pytest.fixture(scope="module")
def trained(tmp_path_factory):
    """Train once for the whole module, artifact into a temp directory."""
    out = tmp_path_factory.mktemp("models") / "model.joblib"
    return train(model_path=out)


@pytest.fixture(scope="module")
def fitted(trained):
    """The saved pipeline, reloaded from disk exactly like future inference."""
    return joblib.load(trained["model_path"])


@pytest.fixture(scope="module")
def split():
    raw = validate_dataset(load_raw_data())
    labelled = keep_supervised_rows(raw)
    return chronological_split(labelled, pd.to_datetime(labelled["decision_date"]))


# ---------------------------------------------------------------------------
# Unknown labels excluded from supervised training (never relabelled 0)
# ---------------------------------------------------------------------------

def test_unknown_outcomes_excluded_from_training(trained):
    ds = trained["dataset"]
    assert (ds["n_raw_rows"], ds["n_labelled_rows"], ds["n_unknown_dropped"]) == (42, 39, 3)
    s = trained["split"]
    # Every labelled row lands in exactly one split; no unknown row can.
    assert s["train"] + s["val"] == ds["n_labelled_rows"] == 39
    # Class totals match the known label distribution (23 zeros, 16 ones).
    assert s["train_reversed"] + s["val_reversed"] == 16
    assert s["train_not_reversed"] + s["val_not_reversed"] == 23


def test_all_unknown_dataset_fails_with_useful_error(tmp_path):
    rows = [base_row(i, target_reversed=np.nan) for i in range(4)]
    with pytest.raises(ValueError, match="No rows with a known outcome.*never converted to 0"):
        train(data_path=write_csv(tmp_path, rows))


# ---------------------------------------------------------------------------
# Feature / target separation in the fitted artifact
# ---------------------------------------------------------------------------

def test_only_decision_time_features_are_used(trained):
    assert trained["features"] == FEATURE_COLUMNS
    assert set(trained["never_features"]) == set(EXCLUDED_FROM_FEATURES)
    # The 7 features + 4 excluded columns are exactly the 11 schema columns.
    assert set(trained["features"]) | set(trained["never_features"]) == set(EXPECTED_COLUMNS)


def test_excluded_columns_absent_from_trained_pipeline(fitted):
    pre = fitted.named_steps["preprocess"]
    names = list(pre.get_feature_names_out())
    for banned in EXCLUDED_FROM_FEATURES:
        assert all(banned != n and not n.endswith("__" + banned) for n in names), banned
    assert any("estimated_cost_usd" in n for n in names)
    # Classifier input width equals the transformed feature space.
    assert fitted.named_steps["classifier"].n_features_in_ == len(names)


# ---------------------------------------------------------------------------
# Preprocessing fit on TRAINING data only
# ---------------------------------------------------------------------------

def test_saved_preprocessing_fit_on_training_split_only(fitted, split):
    pre = fitted.named_steps["preprocess"]

    scaler = pre.named_transformers_["num"].named_steps["scaler"]
    train_means = split.X_train[NUMERIC_FEATURES].mean().to_numpy()
    full_means = pd.concat([split.X_train, split.X_val])[NUMERIC_FEATURES].mean().to_numpy()
    assert np.allclose(scaler.mean_, train_means)
    assert not np.allclose(scaler.mean_, full_means), "scaler must not see holdout rows"

    encoder = pre.named_transformers_["cat"]
    assert set(encoder.categories_[0]) == set(split.X_train["category"].unique())
    assert set(encoder.categories_[1]) == set(split.X_train["confidence_level"].unique())

    # Transformed spaces for train and holdout must match (same fitted object).
    assert pre.transform(split.X_train).shape[1] == pre.transform(split.X_val).shape[1]


# ---------------------------------------------------------------------------
# Determinism / reproducibility
# ---------------------------------------------------------------------------

def test_training_is_deterministic(tmp_path):
    r1 = train(model_path=tmp_path / "a.joblib")
    r2 = train(model_path=tmp_path / "b.joblib")
    assert r1["split"] == r2["split"]
    assert r1["evaluation"] == r2["evaluation"]

    m1 = joblib.load(r1["model_path"])
    m2 = joblib.load(r2["model_path"])
    assert np.allclose(
        m1.named_steps["classifier"].coef_, m2.named_steps["classifier"].coef_
    )

    raw = validate_dataset(load_raw_data())
    labelled = keep_supervised_rows(raw)
    s = chronological_split(labelled, pd.to_datetime(labelled["decision_date"]))
    assert np.allclose(
        m1.predict_proba(s.X_val)[:, 1], m2.predict_proba(s.X_val)[:, 1]
    )


# ---------------------------------------------------------------------------
# Reloaded pipeline produces valid probabilities
# ---------------------------------------------------------------------------

def test_saved_pipeline_reloads_and_predicts(fitted, split, trained):
    proba = fitted.predict_proba(split.X_val)
    assert proba.shape == (len(split.X_val), 2)
    assert np.isfinite(proba).all()
    assert ((proba >= 0.0) & (proba <= 1.0)).all()
    assert np.allclose(proba.sum(axis=1), 1.0)
    # Reloaded artifact reproduces the reported holdout predictions.
    y_pred = (proba[:, 1] >= trained["threshold"]).astype(int)
    assert accuracy_score(split.y_val, y_pred) == pytest.approx(
        trained["evaluation"]["metrics"]["accuracy"]
    )


def test_reported_metrics_are_recomputed_not_fabricated(fitted, split, trained):
    m = trained["evaluation"]["metrics"]
    assert m is not None
    proba = fitted.predict_proba(split.X_val)[:, 1]
    y_pred = (proba >= m["threshold"]).astype(int)
    assert m["accuracy"] == pytest.approx(accuracy_score(split.y_val, y_pred))
    assert m["confusion_matrix"] == confusion_matrix(split.y_val, y_pred, labels=[0, 1]).tolist()
    assert m["f1"] == pytest.approx(
        2 * m["precision"] * m["recall"] / (m["precision"] + m["recall"])
        if (m["precision"] + m["recall"]) > 0
        else 0.0
    )


def test_metrics_are_labelled_unreliable_and_synthetic(trained):
    assert trained["evaluation_reliable"] is False
    assert trained["dataset"]["synthetic"] is True
    assert any("SYNTHETIC" in c for c in trained["evaluation_caveats"])
    ev = trained["evaluation"]
    assert ev["n_val"] == 10
    assert ev["val_reversed_1"] == 5 and ev["val_not_reversed_0"] == 5


# ---------------------------------------------------------------------------
# Small / invalid datasets fail with useful errors
# ---------------------------------------------------------------------------

def test_empty_dataset_fails(tmp_path):
    with pytest.raises(ValueError, match="no rows"):
        train(data_path=write_csv(tmp_path, []))


def test_single_row_dataset_fails(tmp_path):
    path = write_csv(tmp_path, [base_row(0)])
    with pytest.raises(ValueError, match="at least 2 labeled rows"):
        train(data_path=path)


def test_single_class_training_split_fails(tmp_path):
    rows = [base_row(i, target_reversed=1) for i in range(6)]
    with pytest.raises(ValueError, match="single class"):
        train(data_path=write_csv(tmp_path, rows))


def test_missing_file_fails(tmp_path):
    with pytest.raises(FileNotFoundError, match="not found"):
        train(data_path=tmp_path / "nope.csv")


# ---------------------------------------------------------------------------
# Import safety: training never runs as an import side effect
# ---------------------------------------------------------------------------

def test_training_module_has_main_guard():
    source = inspect.getsource(train_module)
    assert 'if __name__ == "__main__":' in source
    assert "main()" in source


def test_importing_training_does_not_run_training():
    """A clean interpreter importing training.train must not train or print."""
    before = sorted(
        (p.name, p.stat().st_size, p.stat().st_mtime_ns) for p in MODEL_PATH.parent.iterdir()
    )
    res = subprocess.run(
        [sys.executable, "-c", "import training.train"],
        cwd=ML_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert res.returncode == 0, res.stderr
    assert "baseline training" not in res.stdout, "training ran during import"
    after = sorted(
        (p.name, p.stat().st_size, p.stat().st_mtime_ns) for p in MODEL_PATH.parent.iterdir()
    )
    assert before == after, "import must not write model artifacts"


def test_prediction_service_import_does_not_run_training():
    """Importing the FastAPI skeleton must not pull in the training module."""
    res = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; import prediction.main; "
            "assert not any(m == 'training' or m.startswith('training.') "
            "for m in sys.modules), 'prediction.main imported training'",
        ],
        cwd=ML_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert res.returncode == 0, res.stderr
