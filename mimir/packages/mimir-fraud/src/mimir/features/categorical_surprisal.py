"""Categorical surprisal features conditioned on card behavior."""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Iterable

import polars as pl


FIELDS = (
    "merchant_category",
    "merchant_name",
    "channel",
    "merchant_country",
    "device_id",
    "ip_address",
)


def _smoothed_nll(count: int, total: int, cardinality: int, alpha: float = 1.0) -> float:
    probability = (count + alpha) / (total + alpha * max(1, cardinality))
    return -math.log(probability)


def _value(row: dict, fields: Iterable[str]) -> str:
    return "|".join(str(row.get(field) or "") for field in fields)


def add_categorical_surprisal_features(df: pl.DataFrame, alpha: float = 1.0) -> pl.DataFrame:
    """Add smoothed negative log-probability features for card-conditioned fields."""

    records = df.to_dicts()
    card_field_counts: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    card_totals: Counter[str] = Counter()
    combo_counts: dict[str, Counter[str]] = defaultdict(Counter)
    combo_cardinality: Counter[str] = Counter()

    for row in records:
        card_id = str(row["card_id"])
        card_totals[card_id] += 1
        for field in FIELDS:
            value = str(row.get(field) or "")
            if value:
                card_field_counts[(card_id, field)][value] += 1
        combo = _value(row, ("merchant_category", "channel", "merchant_country"))
        combo_counts[card_id][combo] += 1

    for field_counts in card_field_counts.values():
        combo_cardinality["field"] = max(combo_cardinality["field"], len(field_counts))

    feature_rows: list[dict[str, float | str]] = []
    for row in records:
        card_id = str(row["card_id"])
        total = card_totals[card_id]
        output: dict[str, float | str] = {"transaction_id": str(row["transaction_id"])}
        nll_values: list[float] = []

        for field in FIELDS:
            value = str(row.get(field) or "")
            counts = card_field_counts[(card_id, field)]
            cardinality = max(1, len(counts))
            if not value:
                nll = 0.0
            else:
                nll = _smoothed_nll(counts[value], total, cardinality, alpha)
            output[f"{field}_card_surprisal"] = round(nll, 4)
            if value:
                nll_values.append(nll)

        combo = _value(row, ("merchant_category", "channel", "merchant_country"))
        combo_cardinality_count = max(1, len(combo_counts[card_id]))
        combo_nll = _smoothed_nll(combo_counts[card_id][combo], total, combo_cardinality_count, alpha)
        output["category_channel_country_combo_surprisal"] = round(combo_nll, 4)
        nll_values.append(combo_nll)
        output["categorical_surprisal_raw"] = round(sum(nll_values) / max(1, len(nll_values)), 4)
        feature_rows.append(output)

    return df.join(pl.DataFrame(feature_rows), on="transaction_id", how="left")
