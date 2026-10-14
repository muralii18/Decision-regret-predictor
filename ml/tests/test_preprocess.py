"""Tests for ml/preprocessing/preprocess.py.

Covers: schema validation, unknown-outcome exclusion, feature/target
separation, deterministic chronological splitting and leakage prevention.
No classifier is trained and no performance metrics are computed.
"""

import numpy as np
import pandas as pd
import pytest

from preprocessing.preprocess import (
    EXPECTED_COLUMNS,
    EXCLUDED_FROM_FEATURES,
    FEATURE_COLUMNS,
    RAW_DATA_PATH,
    TARGET_COLUMN,
    VALID_CATEGORIES,
    build_preprocessor,
    chronological_split,
    keep_supervised_rows,
    load_raw_data,
    validate_dataset,
)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def base_row(i=0, **overrides):
    """One fully valid synthetic row; override fields per test."""
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


def frame(rows):
    if not rows:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)  # schema-only, zero rows
    df = pd.DataFrame(rows)
    return df[EXPECTED_COLUMNS]  # canonical column order


@pytest.fixture(scope="module")
def real_raw():
    """The actual project dataset, validated."""
    return validate_dataset(load_raw_data())


# --------------------------------------------------------------------------
# Loading / path independence
# --------------------------------------------------------------------------

def test_load_is_working_directory_independent(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # launched from somewhere unrelated
    df = load_raw_data()
    assert list(df.columns) == EXPECTED_COLUMNS
    assert RAW_DATA_PATH.is_file()


def test_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError, match="not found"):
        load_raw_data(tmp_path / "nope.csv")


# --------------------------------------------------------------------------
# Schema validation
# --------------------------------------------------------------------------

def test_valid_dataset_passes(real_raw):
    assert len(real_raw) == 42


def test_missing_column_raises():
    df = frame([base_row(0)]).drop(columns=["confidence_level"])
    with pytest.raises(ValueError, match="missing required columns.*confidence_level"):
        validate_dataset(df)


def test_unexpected_column_raises():
    df = frame([base_row(0)])
    df["future_leak_column"] = 1  # e.g. someone adds outcome info
    with pytest.raises(ValueError, match="unexpected columns.*future_leak_column"):
        validate_dataset(df)


def test_empty_dataset_raises():
    with pytest.raises(ValueError, match="no rows"):
        validate_dataset(frame([]))


def test_invalid_confidence_raises():
    df = frame([base_row(0, confidence_level="Very Sure")])
    with pytest.raises(ValueError, match="confidence_level.*Very Sure"):
        validate_dataset(df)


def test_invalid_category_raises():
    df = frame([base_row(0, category="Picking Lunch")])
    with pytest.raises(ValueError, match="category.*Picking Lunch"):
        validate_dataset(df)


def test_non_positive_cost_raises():
    df = frame([base_row(0, estimated_cost_usd=0)])
    with pytest.raises(ValueError, match="estimated_cost_usd must be > 0"):
        validate_dataset(df)


def test_negative_alternatives_raises():
    df = frame([base_row(0, num_alternatives=-1)])
    with pytest.raises(ValueError, match="num_alternatives"):
        validate_dataset(df)


def test_unparseable_date_raises():
    df = frame([base_row(0, decision_date="next tuesday")])
    with pytest.raises(ValueError, match="decision_date contains unparseable"):
        validate_dataset(df)


def test_invalid_target_value_raises():
    df = frame([base_row(0, target_reversed=2)])
    with pytest.raises(ValueError, match=r"invalid values \[2\].*0, 1 or empty"):
        validate_dataset(df)


def test_empty_required_text_raises():
    df = frame([base_row(0, business_context="   ")])
    with pytest.raises(ValueError, match=r"business_context.*contains empty"):
        validate_dataset(df)


# --------------------------------------------------------------------------
# Unknown-outcome exclusion (never relabelled as 0)
# --------------------------------------------------------------------------

def test_unknown_outcomes_are_dropped_not_zeroed(real_raw):
    n_unknown_before = int(real_raw[TARGET_COLUMN].isna().sum())
    n_zeros_before = int((real_raw[TARGET_COLUMN] == 0).sum())
    assert n_unknown_before == 3, "dataset should contain 3 unknown-outcome rows"

    labelled = keep_supervised_rows(real_raw)
    assert len(labelled) == len(real_raw) - n_unknown_before
    assert labelled[TARGET_COLUMN].isna().sum() == 0
    assert set(labelled[TARGET_COLUMN].unique()) <= {0, 1}
    # The decisive check: zeros must not absorb the unknowns.
    assert int((labelled[TARGET_COLUMN] == 0).sum()) == n_zeros_before


def test_empty_string_target_is_unknown_not_zero():
    df = frame([base_row(0, target_reversed=1), base_row(1, target_reversed="")])
    df[TARGET_COLUMN] = df[TARGET_COLUMN].replace("", np.nan)
    labelled = keep_supervised_rows(df)
    assert len(labelled) == 1
    assert int(labelled[TARGET_COLUMN].iloc[0]) == 1


# --------------------------------------------------------------------------
# Feature / target separation
# --------------------------------------------------------------------------

def split(real_raw):
    labelled = keep_supervised_rows(real_raw)
    dates = pd.to_datetime(labelled["decision_date"])
    return labelled, dates, chronological_split(labelled, dates)


def test_split_contains_exactly_the_decision_time_features(real_raw):
    _, _, s = split(real_raw)
    assert list(s.X_train.columns) == FEATURE_COLUMNS
    assert list(s.X_val.columns) == FEATURE_COLUMNS


def test_excluded_columns_never_appear_as_inputs(real_raw):
    _, _, s = split(real_raw)
    assert set(EXCLUDED_FROM_FEATURES).isdisjoint(s.X_train.columns)
    assert set(EXCLUDED_FROM_FEATURES).isdisjoint(s.X_val.columns)


def test_target_is_binary(real_raw):
    _, _, s = split(real_raw)
    assert set(s.y_train.unique()) | set(s.y_val.unique()) == {0, 1}
    assert str(s.y_train.dtype).startswith("int")


# --------------------------------------------------------------------------
# Deterministic chronological splitting
# --------------------------------------------------------------------------

def test_split_is_deterministic(real_raw):
    labelled = keep_supervised_rows(real_raw)
    dates = pd.to_datetime(labelled["decision_date"])
    a = chronological_split(labelled, dates)
    b = chronological_split(labelled, dates)
    pd.testing.assert_frame_equal(a.X_train, b.X_train)
    pd.testing.assert_frame_equal(a.X_val, b.X_val)
    pd.testing.assert_series_equal(a.y_train, b.y_train)
    pd.testing.assert_series_equal(a.y_val, b.y_val)


def test_split_is_chronological(real_raw):
    _, _, s = split(real_raw)
    assert s.train_dates.max() <= s.val_dates.min(), "all training decisions must predate validation"


def test_split_counts_are_reported(real_raw):
    _, _, s = split(real_raw)
    counts = s.counts
    assert counts["train"] + counts["val"] == 39
    assert counts["train"] == 29 and counts["val"] == 10  # 25 % chronological hold-out
    assert counts["train_reversed"] + counts["val_reversed"] == 16


def test_ties_are_broken_by_decision_id():
    rows = [base_row(i, decision_date="2025-06-01") for i in range(6)]
    df = frame(rows)
    labelled = keep_supervised_rows(df)
    s = chronological_split(labelled, pd.to_datetime(labelled["decision_date"]), val_fraction=1 / 3)
    # Same date everywhere -> ordering falls back to decision_id: val = the two biggest ids.
    assert list(s.X_val["business_context"]) == ["Context number 4.", "Context number 5."]
    assert list(s.X_train["business_context"]) == ["Context number 0.", "Context number 1.", "Context number 2.", "Context number 3."]


def test_invalid_val_fraction_raises(real_raw):
    labelled = keep_supervised_rows(real_raw)
    dates = pd.to_datetime(labelled["decision_date"])
    for bad in (0.0, 1.0, -0.5, 1.5):
        with pytest.raises(ValueError, match="val_fraction"):
            chronological_split(labelled, dates, val_fraction=bad)


# --------------------------------------------------------------------------
# Leakage prevention
# --------------------------------------------------------------------------

def test_preprocessor_is_fit_on_train_only():
    """Encoders must see training data only — even when validation holds
    categories/values never observed during training."""
    train = frame([
        base_row(0, category="Hiring", estimated_cost_usd=10_000),
        base_row(1, category="Hiring", estimated_cost_usd=20_000),
        base_row(2, category="Hiring", estimated_cost_usd=30_000),
    ])
    val = frame([
        base_row(3, category="Product Launch", estimated_cost_usd=9_999_999),
    ])
    pre = build_preprocessor().fit(train[FEATURE_COLUMNS])

    encoder = pre.named_transformers_["cat"]
    # Category from validation must NOT appear in the fitted encoder.
    assert "Product Launch" not in list(encoder.categories_[0])
    assert "Hiring" in list(encoder.categories_[0])

    # Scaler statistics must equal train-only statistics, not full-data ones.
    scaler = pre.named_transformers_["num"].named_steps["scaler"]
    train_means = train[["estimated_cost_usd", "num_alternatives"]].mean().to_numpy()
    assert np.allclose(scaler.mean_, train_means)
    full_means = pd.concat([train, val])[["estimated_cost_usd", "num_alternatives"]].mean().to_numpy()
    assert not np.allclose(scaler.mean_, full_means)

    # Transforming unseen categories must not crash (handle_unknown='ignore').
    out = pre.transform(val[FEATURE_COLUMNS])
    assert out.shape[0] == 1


def test_outcome_columns_cannot_reach_the_feature_matrix(real_raw):
    _, _, s = split(real_raw)
    pre = build_preprocessor().fit(s.X_train)
    names = list(pre.get_feature_names_out())
    for banned in EXCLUDED_FROM_FEATURES:
        assert all(banned != n and not n.endswith("__" + banned) for n in names), banned
    assert any("estimated_cost_usd" in n for n in names)  # real features present


def test_transform_on_val_uses_trained_space(real_raw):
    _, _, s = split(real_raw)
    pre = build_preprocessor().fit(s.X_train)
    x_tr = pre.transform(s.X_train)
    x_va = pre.transform(s.X_val)
    assert x_tr.shape[1] == x_va.shape[1]
