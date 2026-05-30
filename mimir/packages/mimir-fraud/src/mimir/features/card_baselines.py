"""Per-card behavioral baseline features."""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Any

import polars as pl

from mimir.core.constants import EPSILON
from mimir.scoring.normalize import robust_median_mad, robust_z


def add_card_baseline_features(df: pl.DataFrame) -> pl.DataFrame:
    """Add robust per-card amount and historical novelty features."""

    records = df.to_dicts()
    card_amounts: dict[str, list[float]] = defaultdict(list)
    for row in records:
        card_amounts[str(row["card_id"])].append(float(row["amount"]))

    card_stats: dict[str, dict[str, float]] = {}
    for card_id, amounts in card_amounts.items():
        logs = [math.log1p(amount) for amount in amounts]
        median_log, mad_log = robust_median_mad(logs)
        median_amount, _ = robust_median_mad(amounts)
        card_stats[card_id] = {
            "card_tx_count": float(len(amounts)),
            "card_median_amount": median_amount,
            "card_median_log_amount": median_log,
            "card_mad_log_amount": mad_log,
        }

    seen_category: dict[str, set[str]] = defaultdict(set)
    seen_merchant: dict[str, set[str]] = defaultdict(set)
    seen_device: dict[str, set[str]] = defaultdict(set)
    seen_ip: dict[str, set[str]] = defaultdict(set)
    seen_channel: dict[str, Counter[str]] = defaultdict(Counter)
    seen_country: dict[str, Counter[str]] = defaultdict(Counter)
    prior_count: dict[str, int] = defaultdict(int)

    feature_rows: list[dict[str, Any]] = []
    for row in sorted(records, key=lambda item: item["_timestamp_dt"]):
        card_id = str(row["card_id"])
        stats = card_stats[card_id]
        amount = float(row["amount"])
        log_amount = math.log1p(amount)
        prior = prior_count[card_id]
        category = str(row["merchant_category"])
        merchant = str(row["merchant_name"])
        device = str(row.get("device_id") or "")
        ip_address = str(row.get("ip_address") or "")
        channel = str(row["channel"])
        merchant_country = str(row["merchant_country"])
        cardholder_country = str(row["cardholder_country"])

        channel_seen = seen_channel[card_id][channel]
        country_seen = seen_country[card_id][merchant_country]
        feature_rows.append(
            {
                "transaction_id": row["transaction_id"],
                "card_tx_count": int(stats["card_tx_count"]),
                "card_median_amount": round(stats["card_median_amount"], 4),
                "card_mad_log_amount": round(stats["card_mad_log_amount"], 6),
                "amount_ratio_to_card_median": round(amount / (stats["card_median_amount"] + EPSILON), 4),
                "robust_z_log_amount": round(
                    robust_z(log_amount, stats["card_median_log_amount"], stats["card_mad_log_amount"], EPSILON),
                    4,
                ),
                "category_is_new_for_card": prior >= 3 and category not in seen_category[card_id],
                "merchant_is_new_for_card": prior >= 3 and merchant not in seen_merchant[card_id],
                "device_is_new_for_card": bool(device) and prior >= 3 and device not in seen_device[card_id],
                "ip_is_new_for_card": bool(ip_address) and prior >= 3 and ip_address not in seen_ip[card_id],
                "channel_is_unusual_for_card": prior >= 8 and (channel_seen / max(1, prior)) <= 0.10,
                "merchant_country_is_unusual_for_card": prior >= 8 and (country_seen / max(1, prior)) <= 0.10,
                "country_mismatch": cardholder_country != merchant_country,
                "prior_card_tx_count": prior,
            }
        )

        prior_count[card_id] += 1
        seen_category[card_id].add(category)
        seen_merchant[card_id].add(merchant)
        if device:
            seen_device[card_id].add(device)
        if ip_address:
            seen_ip[card_id].add(ip_address)
        seen_channel[card_id][channel] += 1
        seen_country[card_id][merchant_country] += 1

    features = pl.DataFrame(feature_rows)
    return df.join(features, on="transaction_id", how="left")
