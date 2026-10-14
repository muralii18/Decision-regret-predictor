"""Deterministic generator for the SYNTHETIC decision dataset.

*** SYNTHETIC DATA — NOT REAL ORGANIZATIONAL EVIDENCE ***
Every record produced here is fabricated for interface/ML-pipeline testing.
The numbers, texts and outcomes must never be presented as real decisions
from a real organization.

Output: ml/data/raw/decisions_synthetic_v1.csv (deterministic, seed below).

Label convention (kept consistent with the dataset documentation):
  target_reversed = 1    -> decision was reversed within the observation window
  target_reversed = 0    -> decision was NOT reversed within the observation window
  target_reversed = ""   -> outcome unknown (observation window still open);
                            such rows must be EXCLUDED from training, never
                            relabelled as 0.
"""

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20261010
TODAY = date(2026, 10, 10)
OUT_PATH = Path(__file__).resolve().parent / "raw" / "decisions_synthetic_v1.csv"

CATEGORIES = [
    "Hiring",
    "Supplier Selection",
    "Project Approval",
    "Equipment Purchase",
    "Product Launch",
    "Technology Selection",
]

# Slight per-category propensity to be reversed (synthetic assumption only).
CATEGORY_EFFECT = {
    "Hiring": 0.05,
    "Supplier Selection": 0.10,
    "Project Approval": 0.00,
    "Equipment Purchase": -0.10,
    "Product Launch": 0.20,
    "Technology Selection": 0.15,
}

CONTEXT = {
    "Hiring": [
        "Filled an open senior engineering role after two months of interviewing",
        "Approved headcount for a new team lead after a colleague resigned",
        "Extended an offer to a candidate with strong references but a short tenure history",
    ],
    "Supplier Selection": [
        "Chose a regional vendor offering the lowest tendered price for component supply",
        "Switched logistics providers to reduce per-unit shipping costs",
        "Selected a single-source supplier for a critical raw material",
    ],
    "Project Approval": [
        "Approved a new internal reporting platform to replace spreadsheet workflows",
        "Gave funding approval for a six-month warehouse automation pilot",
        "Green-lit an office expansion ahead of an expected hiring wave",
    ],
    "Equipment Purchase": [
        "Replaced the aging delivery vehicle fleet with three leased electric vans",
        "Bought new workstations for the design team ahead of a product refresh",
        "Invested in industrial printers to bring packaging in-house",
    ],
    "Product Launch": [
        "Launched a budget tier of the product in two new regional markets",
        "Released a self-service onboarding flow ahead of the holiday campaign",
        "Started selling annual plans with a launch discount to drive subscriptions",
    ],
    "Technology Selection": [
        "Migrated the analytics stack to a new managed cloud provider",
        "Adopted a new customer support ticketing system across three departments",
        "Chose a new frontend framework for the customer portal rewrite",
    ],
}

BENEFITS = [
    "Expected lower operating costs within the first year",
    "Expected faster delivery cycles for customers",
    "Expected improvement in team capacity and morale",
    "Expected revenue growth from the new market segment",
    "Expected reduction in manual effort and human error",
    "Expected stronger compliance and audit readiness",
]

RISKS = [
    "Switching costs and vendor lock-in were flagged as moderate",
    "Schedule slippage was identified as a realistic failure mode",
    "The budget had little contingency for overrun",
    "Key-person dependency on a small implementation team",
    "Market response was uncertain and hard to forecast",
    "Integration with legacy systems was flagged as complex",
]

TAILS = [
    "The decision was reviewed with department heads before sign-off.",
    "It was made under time pressure ahead of a quarterly deadline.",
    "A small pilot preceded the full commitment.",
    "Finance reviewed the business case in the same week.",
    "The team had partial prior experience with a similar choice.",
    "Stakeholders accepted the trade-offs on record.",
    "No formal benchmark against alternatives was available.",
    "The decision relied mainly on internal expert judgement.",
]


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def build_rows():
    rng = random.Random(SEED)
    rows = []

    # Decide up front which three records stay outcome-unknown (recent decisions
    # whose observation window has not elapsed).
    unknown_slots = {(1, 3), (3, 5), (5, 2)}  # (category index, row index)

    for cat_idx, category in enumerate(CATEGORIES):
        for row_idx in range(7):
            # --- timing: unknown rows are recent, labelled rows are older ---
            if (cat_idx, row_idx) in unknown_slots:
                decision_date = TODAY - timedelta(days=rng.randint(20, 95))
                window = 365  # window still open -> outcome unknown
            else:
                window = rng.choice([180, 365])
                latest = TODAY - timedelta(days=window + 7)
                decision_date = date(2024, 1, 15) + timedelta(
                    days=rng.randint(0, (latest - date(2024, 1, 15)).days)
                )

            # --- decision-time features ---
            log_cost = rng.uniform(math.log(5_000), math.log(3_000_000))
            cost = int(round(math.exp(log_cost) / 100.0) * 100)
            alternatives = rng.choices([0, 1, 2, 3, 4, 5, 6], weights=[4, 10, 18, 22, 18, 12, 6])[0]
            confidence = rng.choices(["Low", "Medium", "High"], weights=[25, 50, 25])[0]

            context = f"{rng.choice(CONTEXT[category])}. {rng.choice(TAILS)}"
            benefits = f"{rng.choice(BENEFITS)}. {rng.choice(TAILS)}"
            risks = f"{rng.choice(RISKS)}. {rng.choice(TAILS)}"

            rows.append(
                {
                    "decision_id": "",  # filled after sorting by date
                    "decision_date": decision_date,
                    "category": category,
                    "estimated_cost_usd": cost,
                    "num_alternatives": alternatives,
                    "confidence_level": confidence,
                    "business_context": context,
                    "expected_benefits": benefits,
                    "identified_risks": risks,
                    "observation_window_days": window,
                    "_propensity": None,
                }
            )

    # Latent reversal propensity from decision-time features only (synthetic).
    for row in rows:
        score = (
            -0.8
            + 0.40 * math.log10(max(row["estimated_cost_usd"], 1))
            - 0.45 * row["num_alternatives"]
            + {"Low": 0.9, "Medium": 0.1, "High": -0.5}[row["confidence_level"]]
            + CATEGORY_EFFECT[row["category"]]
            + rng.uniform(-0.7, 0.7)
        )
        row["_propensity"] = sigmoid(score)

    # Label deterministically: top 40 % of propensity among ELAPSED rows = reversed.
    elapsed = [
        r for r in rows if r["decision_date"] + timedelta(days=r["observation_window_days"]) <= TODAY
    ]
    unknown = [r for r in rows if r not in elapsed]
    ranked = sorted(elapsed, key=lambda r: (-r["_propensity"], r["decision_date"]))
    n_reversed = round(0.40 * len(ranked))
    reversed_ids = {id(r) for r in ranked[:n_reversed]}
    for row in elapsed:
        row["target_reversed"] = 1 if id(row) in reversed_ids else 0
    for row in unknown:
        row["target_reversed"] = ""  # outcome UNKNOWN — must not become 0

    # Stable chronological ids.
    rows.sort(key=lambda r: (r["decision_date"], r["category"]))
    for i, row in enumerate(rows, start=1):
        row["decision_id"] = f"DRP-{i:04d}"

    return rows


def main():
    rows = build_rows()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
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
    with OUT_PATH.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            out = dict(row)
            out["decision_date"] = row["decision_date"].isoformat()
            writer.writerow(out)

    labelled = [r for r in rows if r["target_reversed"] != ""]
    print(f"Wrote {len(rows)} synthetic records to {OUT_PATH}")
    print(f"  labelled: {len(labelled)} (reversed=1: {sum(r['target_reversed']==1 for r in labelled)}, "
          f"not-reversed=0: {sum(r['target_reversed']==0 for r in labelled)})")
    print(f"  unknown outcome (empty target): {len(rows) - len(labelled)}")


if __name__ == "__main__":
    main()
