"""Model training for the Decision Regret Predictor.

Trains a baseline binary classifier that estimates the risk that a decision
will be reversed (``target_reversed``), using the existing preprocessing
pipeline and the SYNTHETIC prototype dataset.

Honesty rules baked into this module:
  * Unknown outcomes (empty ``target_reversed``) are DROPPED before training
    and are never relabelled as 0.
  * Only the seven decision-time features are used. ``decision_id``,
    ``decision_date``, ``observation_window_days`` and ``target_reversed``
    are excluded by construction (``FEATURE_COLUMNS`` + ``remainder='drop'``).
  * Preprocessing is fit on the TRAINING split only, inside a single
    scikit-learn Pipeline, so training and inference share one fitted object.
  * The dataset is small and synthetic: holdout metrics are reported with
    their counts and caveats and must never be quoted as evidence of
    accuracy or production-readiness.

Usage (from the repository root or from ml/):
    .venv/bin/python ml/training/train.py        # repo root
    ../.venv/bin/python training/train.py        # from ml/

Importing this module never runs training — only ``__main__`` does.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make `ml/` importable when this file is executed directly (mirrors conftest).
ML_ROOT = str(Path(__file__).resolve().parents[1])
if ML_ROOT not in sys.path:
    sys.path.insert(0, ML_ROOT)

import joblib  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline  # noqa: E402

from preprocessing.preprocess import (  # noqa: E402
    EXCLUDED_FROM_FEATURES,
    FEATURE_COLUMNS,
    RAW_DATA_PATH,
    TARGET_COLUMN,
    build_preprocessor,
    chronological_split,
    keep_supervised_rows,
    load_raw_data,
    validate_dataset,
)

# ---------------------------------------------------------------------------
# Stable, documented artifact path (models/*.joblib is git-ignored by
# convention — regenerate with the command in ml/README.md).
# ---------------------------------------------------------------------------
MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
MODEL_PATH = MODELS_DIR / "regret_risk_model.joblib"

RANDOM_STATE = 42
CLASSIFICATION_THRESHOLD = 0.5

# Caveats printed next to every metric set and stored in the report.
EVALUATION_CAVEATS = [
    "Dataset is SYNTHETIC and experimental — metrics describe generator assumptions, not real decisions.",
    "The holdout contains very few rows; any metric has very high variance.",
    "A single chronological block cannot represent seasonal or distribution shift.",
    "These results are NOT evidence that the model is accurate or production-ready.",
]


def build_model() -> Pipeline:
    """Baseline classifier wrapped with the fitted-on-train preprocessing.

    One Pipeline object holds preprocessing + classifier, so the exact same
    fitted transformers are used for training and for every later inference.
    """
    return Pipeline(
        steps=[
            ("preprocess", build_preprocessor()),
            (
                "classifier",
                LogisticRegression(
                    max_iter=5000,
                    class_weight="balanced",
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )


def evaluate_holdout(
    y_true: pd.Series,
    probabilities: np.ndarray,
    threshold: float = CLASSIFICATION_THRESHOLD,
) -> dict:
    """Compute holdout metrics from probabilities.

    Returns None-safe metrics: if the holdout contains a single class,
    precision/recall/F1 are not meaningful, so they are omitted and
    ``reason`` explains why instead of inventing numbers.
    """
    y_true = np.asarray(y_true)
    y_pred = (np.asarray(probabilities, dtype=float) >= threshold).astype(int)

    counts = {
        "n_val": int(y_true.size),
        "val_not_reversed_0": int((y_true == 0).sum()),
        "val_reversed_1": int((y_true == 1).sum()),
    }

    if y_true.size == 0:
        return {**counts, "metrics": None, "reason": "Holdout is empty."}
    if np.unique(y_true).size < 2:
        return {
            **counts,
            "metrics": None,
            "reason": (
                "Holdout contains a single class; accuracy alone would be "
                "misleading and precision/recall/F1 are undefined — no "
                "metrics are reported."
            ),
        }

    matrix = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return {
        **counts,
        "metrics": {
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "precision": float(precision_score(y_true, y_pred, zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, zero_division=0)),
            "f1": float(f1_score(y_true, y_pred, zero_division=0)),
            # [[TN, FP], [FN, TP]] with labels [0, 1]
            "confusion_matrix": matrix.tolist(),
            "threshold": float(threshold),
        },
        "reason": None,
    }


def train(
    data_path: Path | None = None,
    model_path: Path | None = None,
    val_fraction: float = 0.25,
) -> dict:
    """Train the baseline model, evaluate it, and save one fitted Pipeline.

    Returns a report dict (counts, metrics, caveats, artifact path). Raises
    ValueError with a clear message when the dataset cannot support training.
    """
    raw = validate_dataset(load_raw_data(data_path))

    labelled = keep_supervised_rows(raw)
    n_unknown = len(raw) - len(labelled)
    if len(labelled) == 0:
        raise ValueError(
            "No rows with a known outcome (target_reversed = 0 or 1): training "
            f"is impossible. {n_unknown} row(s) have unknown outcomes; unknown "
            "labels are excluded, never converted to 0."
        )

    dates = pd.to_datetime(labelled["decision_date"])
    split = chronological_split(labelled, dates, val_fraction=val_fraction)

    # Defensive: both splits must contain both classes for a sane baseline.
    for name, y in (("training", split.y_train), ("holdout", split.y_val)):
        if np.unique(y).size < 2:
            raise ValueError(
                f"The {name} split contains a single class "
                f"({sorted(pd.unique(y))}); a binary classifier cannot be "
                "trained/evaluated. Collect more labelled data or change "
                "val_fraction."
            )

    model = build_model()
    # The Pipeline fit on X_train fits preprocessing on the TRAINING split only.
    model.fit(split.X_train, split.y_train)

    probabilities = model.predict_proba(split.X_val)[:, 1]
    if not np.all(np.isfinite(probabilities)) or np.any(
        (probabilities < 0.0) | (probabilities > 1.0)
    ):
        raise RuntimeError("Model produced invalid probabilities — refusing to save.")

    evaluation = evaluate_holdout(split.y_val, probabilities)

    out_path = Path(model_path) if model_path is not None else MODEL_PATH
    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out_path)

    report = {
        "model_path": str(out_path),
        "algorithm": "LogisticRegression(balanced class weights)",
        "features": list(FEATURE_COLUMNS),
        "never_features": list(EXCLUDED_FROM_FEATURES),
        "target": TARGET_COLUMN,
        "random_state": RANDOM_STATE,
        "threshold": CLASSIFICATION_THRESHOLD,
        "dataset": {
            "path": str(data_path) if data_path is not None else str(RAW_DATA_PATH),
            "synthetic": True,
            "n_raw_rows": int(len(raw)),
            "n_labelled_rows": int(len(labelled)),
            "n_unknown_dropped": int(n_unknown),
        },
        "split": split.counts,
        "evaluation": evaluation,
        "evaluation_reliable": False,
        "evaluation_caveats": list(EVALUATION_CAVEATS),
    }
    return report


def format_report(report: dict) -> str:
    """Human-readable training summary (metrics always shown with counts)."""
    ds = report["dataset"]
    metrics = report["evaluation"]["metrics"]
    lines = [
        "=== Decision Regret Predictor — baseline training ===",
        f"Dataset           : {ds['path']} (SYNTHETIC, experimental)",
        f"Rows              : {ds['n_raw_rows']} raw -> {ds['n_labelled_rows']} labelled "
        f"({ds['n_unknown_dropped']} unknown outcome(s) dropped, never relabelled 0)",
        f"Features ({len(report['features'])})        : {', '.join(report['features'])}",
        f"Never features    : {', '.join(report['never_features'])}",
        f"Algorithm         : {report['algorithm']} (random_state={report['random_state']})",
        f"Split (chronological): {report['split']}",
        "Preprocessing     : fit on the training split only, saved inside the pipeline",
    ]
    if metrics is None:
        lines.append(f"Holdout metrics   : NOT COMPUTED — {report['evaluation']['reason']}")
    else:
        cm = metrics["confusion_matrix"]
        lines += [
            f"Holdout metrics   : n={report['evaluation']['n_val']} "
            f"(0: {report['evaluation']['val_not_reversed_0']}, "
            f"1: {report['evaluation']['val_reversed_1']}), "
            f"threshold={metrics['threshold']}",
            f"  accuracy={metrics['accuracy']:.3f}  precision={metrics['precision']:.3f}  "
            f"recall={metrics['recall']:.3f}  f1={metrics['f1']:.3f}",
            f"  confusion matrix [[TN, FP], [FN, TP]] = {cm}",
        ]
    lines.append("Caveats           :")
    lines += [f"  - {c}" for c in report["evaluation_caveats"]]
    lines.append(f"Saved pipeline    : {report['model_path']}")
    return "\n".join(lines)


def main() -> None:
    print(format_report(train()))


if __name__ == "__main__":
    main()
