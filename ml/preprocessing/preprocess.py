"""Data preprocessing for the Decision Regret Predictor.

Implements: raw-data loading (working-directory independent), strict schema
validation, supervised-row selection, a reproducible CHRONOLOGICAL
train/validation split, and scikit-learn transformation pipelines that are
fit on training data only.

NO model is trained here and no performance metrics are produced.

Target semantics (binary classification):
    1 = decision was reversed within its observation window
    0 = decision was NOT reversed within its observation window
    empty = outcome unknown -> row is DROPPED, never relabelled as 0.
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer

# ---------------------------------------------------------------------------
# Paths / schema constants
# ---------------------------------------------------------------------------

# Path is derived from this file, NOT from the process working directory,
# so loading works no matter where the code is launched from.
RAW_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "raw" / "decisions_synthetic_v1.csv"

EXPECTED_COLUMNS = [
    "decision_id",
    "decision_date",
    "category",
    "estimated_cost_usd",
    "num_alternatives",
    "confidence_level",
    "business_context",
    "expected_benefits",
    "identified_risks",
    "observation_window_days",
    "target_reversed",
]

# Decision-time information only — the only legitimate model inputs.
FEATURE_COLUMNS = [
    "category",
    "estimated_cost_usd",
    "num_alternatives",
    "confidence_level",
    "business_context",
    "expected_benefits",
    "identified_risks",
]

# Outcome/context columns that must NEVER be model inputs.
EXCLUDED_FROM_FEATURES = [
    "decision_id",
    "decision_date",
    "observation_window_days",
    "target_reversed",
]

TARGET_COLUMN = "target_reversed"
VALID_CONFIDENCE_LEVELS = ("Low", "Medium", "High")
VALID_CATEGORIES = (
    "Hiring",
    "Supplier Selection",
    "Project Approval",
    "Equipment Purchase",
    "Product Launch",
    "Technology Selection",
)
VALID_OBSERVATION_WINDOWS = (180, 365)

NUMERIC_FEATURES = ["estimated_cost_usd", "num_alternatives"]
CATEGORICAL_FEATURES = ["category", "confidence_level"]
TEXT_FEATURES = ["business_context", "expected_benefits", "identified_risks"]


# ---------------------------------------------------------------------------
# Loading + validation
# ---------------------------------------------------------------------------


def load_raw_data(path: Path | None = None) -> pd.DataFrame:
    """Load the raw CSV using a path independent of the working directory."""
    csv_path = Path(path) if path is not None else RAW_DATA_PATH
    if not csv_path.is_file():
        raise FileNotFoundError(f"Raw decision dataset not found: {csv_path}")
    return pd.read_csv(csv_path)


def validate_dataset(df: pd.DataFrame) -> pd.DataFrame:
    """Validate schema, required fields, value ranges and target values.

    Raises ValueError with a clear message describing the first problem found.
    """
    problems = []

    missing = [c for c in EXPECTED_COLUMNS if c not in df.columns]
    unexpected = [c for c in df.columns if c not in EXPECTED_COLUMNS]
    if missing:
        problems.append(f"missing required columns {missing}")
    if unexpected:
        problems.append(f"unexpected columns {unexpected}")
    if problems:
        raise ValueError("Dataset validation failed: " + "; ".join(problems))

    if len(df) == 0:
        raise ValueError("Dataset validation failed: dataset contains no rows")

    # Required text/enum fields must be present and non-empty.
    for col in ["decision_id", "category", "confidence_level", "business_context",
                "expected_benefits", "identified_risks", "decision_date"]:
        if df[col].isna().any():
            problems.append(f"column '{col}' contains missing values")
        elif df[col].astype(str).str.strip().eq("").any():
            problems.append(f"column '{col}' contains empty values")

    unknown_cats = sorted(set(df["category"].dropna().astype(str)) - set(VALID_CATEGORIES))
    if unknown_cats:
        problems.append(f"unknown category values {unknown_cats}")

    unknown_conf = sorted(set(df["confidence_level"].dropna().astype(str)) - set(VALID_CONFIDENCE_LEVELS))
    if unknown_conf:
        problems.append(f"unknown confidence_level values {unknown_conf} (expected {list(VALID_CONFIDENCE_LEVELS)})")

    # Numeric checks.
    costs = pd.to_numeric(df["estimated_cost_usd"], errors="coerce")
    if costs.isna().any():
        problems.append("estimated_cost_usd contains non-numeric or missing values")
    elif not (costs > 0).all():
        problems.append("estimated_cost_usd must be > 0")

    alts = pd.to_numeric(df["num_alternatives"], errors="coerce")
    if alts.isna().any():
        problems.append("num_alternatives contains non-numeric or missing values")
    elif not ((alts >= 0) & (alts % 1 == 0)).all():
        problems.append("num_alternatives must be a non-negative integer")

    # Dates.
    dates = pd.to_datetime(df["decision_date"], errors="coerce")
    if dates.isna().any():
        problems.append("decision_date contains unparseable dates")
    elif (dates > pd.Timestamp.now("UTC").tz_localize(None)).any():
        problems.append("decision_date contains future dates")

    windows = pd.to_numeric(df["observation_window_days"], errors="coerce")
    if windows.isna().any() or not set(windows.astype(int)) <= set(VALID_OBSERVATION_WINDOWS):
        problems.append(f"observation_window_days must be one of {list(VALID_OBSERVATION_WINDOWS)}")

    # Target values: only 0, 1 or empty (empty = unknown outcome).
    target = df[TARGET_COLUMN]
    non_null = target.dropna()
    bad_targets = sorted(set(pd.to_numeric(non_null, errors="coerce").dropna().astype(int))
                         - {0, 1})
    if pd.to_numeric(non_null, errors="coerce").isna().any():
        problems.append("target_reversed contains non-numeric values")
    elif bad_targets:
        problems.append(f"target_reversed contains invalid values {bad_targets} (allowed: 0, 1 or empty)")

    if problems:
        raise ValueError("Dataset validation failed: " + "; ".join(problems))

    return df


def keep_supervised_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only rows with a known outcome (0 or 1).

    Unknown outcomes (empty target) are DROPPED — they are never converted to 0.
    """
    known = df[df[TARGET_COLUMN].notna()].copy()
    known[TARGET_COLUMN] = known[TARGET_COLUMN].astype(int)
    return known.reset_index(drop=True)


def prepare_supervised_dataset(path: Path | None = None) -> tuple[pd.DataFrame, pd.Series]:
    """Load, validate and select labeled rows. Returns (features+meta, target)."""
    df = validate_dataset(load_raw_data(path))
    labelled = keep_supervised_rows(df)
    return labelled, labelled[TARGET_COLUMN]


# ---------------------------------------------------------------------------
# Reproducible chronological split
# ---------------------------------------------------------------------------


@dataclass
class DataSplit:
    X_train: pd.DataFrame
    X_val: pd.DataFrame
    y_train: pd.Series
    y_val: pd.Series
    train_dates: pd.Series
    val_dates: pd.Series

    @property
    def counts(self) -> dict:
        return {
            "train": int(len(self.X_train)),
            "val": int(len(self.X_val)),
            "train_reversed": int(self.y_train.sum()),
            "train_not_reversed": int((self.y_train == 0).sum()),
            "val_reversed": int(self.y_val.sum()),
            "val_not_reversed": int((self.y_val == 0).sum()),
        }


def chronological_split(
    labelled_df: pd.DataFrame,
    dates: pd.Series,
    val_fraction: float = 0.25,
) -> DataSplit:
    """Split the OLDEST rows for training and the NEWEST for validation.

    Deterministic and chronological (sorted by decision_date, ties broken by
    decision_id). No randomness is involved, so repeated calls return the
    identical split. No random-split fallback exists by design.

    LIMITATION: with only a few dozen rows, a chronological split can put
    very few (or one-sided) examples in validation. Counts are reported via
    DataSplit.counts — always inspect them before trusting any evaluation.
    """
    if not 0.0 < val_fraction < 1.0:
        raise ValueError("val_fraction must be strictly between 0 and 1")

    n = len(labelled_df)
    if n < 2:
        raise ValueError(f"Need at least 2 labeled rows to split, got {n}")

    # Sort by date (primary), ties broken deterministically by decision_id.
    order = np.lexsort((labelled_df["decision_id"].to_numpy(), pd.to_datetime(dates).to_numpy()))
    n_val = max(1, int(round(n * val_fraction)))
    val_idx = order[-n_val:]
    train_idx = order[:-n_val]

    return DataSplit(
        X_train=labelled_df.iloc[train_idx][FEATURE_COLUMNS].reset_index(drop=True),
        X_val=labelled_df.iloc[val_idx][FEATURE_COLUMNS].reset_index(drop=True),
        y_train=labelled_df.iloc[train_idx][TARGET_COLUMN].reset_index(drop=True),
        y_val=labelled_df.iloc[val_idx][TARGET_COLUMN].reset_index(drop=True),
        train_dates=pd.Series(pd.to_datetime(dates).iloc[train_idx]).reset_index(drop=True),
        val_dates=pd.Series(pd.to_datetime(dates).iloc[val_idx]).reset_index(drop=True),
    )


# ---------------------------------------------------------------------------
# scikit-learn transformation pipeline (fit on TRAIN ONLY)
# ---------------------------------------------------------------------------


def build_preprocessor() -> ColumnTransformer:
    """Numeric scaling + one-hot encoding + TF-IDF text features.

    Only FEATURE_COLUMNS are transformers; remainder='drop' guarantees that
    decision_id, decision_date, observation_window_days and target_reversed
    can never leak into the feature matrix.

    The returned object must be fit on the training split ONLY (never on the
    full dataset) to prevent preprocessing leakage.
    """
    text_pipes = [
        (
            f"txt_{col}",
            TfidfVectorizer(max_features=150, ngram_range=(1, 2), min_df=1),
            col,
        )
        for col in TEXT_FEATURES
    ]

    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                NUMERIC_FEATURES,
            ),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
            *text_pipes,
        ],
        remainder="drop",
        verbose_feature_names_out=True,
    )


# ---------------------------------------------------------------------------
# CLI summary (no model, no metrics)
# ---------------------------------------------------------------------------


def main() -> None:
    raw = validate_dataset(load_raw_data())
    labelled = keep_supervised_rows(raw)
    target = labelled[TARGET_COLUMN]
    dates = pd.to_datetime(labelled["decision_date"])
    split = chronological_split(labelled, dates)
    pre = build_preprocessor().fit(split.X_train)  # train only, by design

    print(f"Raw rows validated      : {len(raw)}")
    print(f"Labeled rows (0 or 1)   : {len(labelled)} "
          f"(reversed=1: {int(target.sum())}, not-reversed=0: {int((target == 0).sum())})")
    print(f"Unknowns dropped        : {len(raw) - len(labelled)}")
    print(f"Chronological split     : {split.counts}")
    print(f"Feature matrix columns  : {pre.get_feature_names_out().shape[0]} (fit on train only)")


if __name__ == "__main__":
    main()
