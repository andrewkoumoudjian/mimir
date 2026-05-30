"""Temporal velocity and burst features."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import polars as pl

from mimir.core.constants import HIGH_AMOUNT_LIMIT, HIGH_RISK_CATEGORIES


def _within(center, candidate, window_minutes: int) -> bool:
    delta = abs(candidate - center)
    return delta <= timedelta(minutes=window_minutes)


def _within_past(center, candidate, window_minutes: int) -> bool:
    delta = center - candidate
    return timedelta(0) <= delta <= timedelta(minutes=window_minutes)


def add_temporal_velocity_features(df: pl.DataFrame) -> pl.DataFrame:
    """Add simple rolling-window features over the one-month dataset."""

    records = df.to_dicts()
    feature_rows: list[dict[str, Any]] = []

    for row in records:
        timestamp = row["_timestamp_dt"]
        card_id = row["card_id"]
        merchant = row["merchant_name"]
        category = row["merchant_category"]
        device = row.get("device_id") or ""
        ip_address = row.get("ip_address") or ""
        amount = float(row["amount"])

        rows_10m = [other for other in records if _within(timestamp, other["_timestamp_dt"], 10)]
        rows_60m = [other for other in records if _within(timestamp, other["_timestamp_dt"], 60)]
        rows_24h = [other for other in records if _within(timestamp, other["_timestamp_dt"], 24 * 60)]

        card_10m = [other for other in rows_10m if other["card_id"] == card_id]
        card_60m = [other for other in rows_60m if other["card_id"] == card_id]
        merchant_60m = [other for other in rows_60m if other["merchant_name"] == merchant]
        same_card_merchant_60m = [
            other for other in card_60m if other["merchant_name"] == merchant
        ]
        same_card_category_merchant_60m = [
            other
            for other in card_60m
            if other["merchant_name"] == merchant and other["merchant_category"] == category
        ]
        near_duplicate_24h = [
            other
            for other in rows_24h
            if other["card_id"] == card_id
            and other["merchant_name"] == merchant
            and other["transaction_id"] != row["transaction_id"]
            and abs(float(other["amount"]) - amount) <= max(1.0, amount * 0.02)
        ]
        device_60m = [
            other for other in rows_60m if device and (other.get("device_id") or "") == device
        ]
        device_24h = [
            other for other in rows_24h if device and (other.get("device_id") or "") == device
        ]
        ip_60m = [
            other for other in rows_60m if ip_address and (other.get("ip_address") or "") == ip_address
        ]

        split_sum = sum(float(other["amount"]) for other in same_card_category_merchant_60m)
        split_purchase_suspect = len(same_card_category_merchant_60m) >= 3 and (
            split_sum >= 300 or len(same_card_category_merchant_60m) >= 8
        )

        feature_rows.append(
            {
                "transaction_id": row["transaction_id"],
                "card_tx_count_10m": len(card_10m),
                "card_tx_count_60m": len(card_60m),
                "card_online_tx_count_60m": sum(1 for other in card_60m if other["channel"] == "online"),
                "card_small_tx_count_60m": sum(1 for other in card_60m if float(other["amount"]) <= 25),
                "merchant_tx_count_60m": len(merchant_60m),
                "merchant_unique_cards_60m": len({other["card_id"] for other in merchant_60m}),
                "device_unique_cards_60m": len({other["card_id"] for other in device_60m}) if device else 0,
                "ip_unique_cards_60m": len({other["card_id"] for other in ip_60m}) if ip_address else 0,
                "same_card_same_merchant_count_60m": len(same_card_merchant_60m),
                "same_card_same_amount_near_duplicate_24h": len(near_duplicate_24h) > 0,
                "split_purchase_suspect": split_purchase_suspect,
                "same_card_same_merchant_sum_60m": round(sum(float(other["amount"]) for other in same_card_merchant_60m), 2),
                "card_high_risk_tx_count_24h": sum(
                    1
                    for other in rows_24h
                    if other["card_id"] == card_id and other["merchant_category"] in HIGH_RISK_CATEGORIES
                ),
                "card_high_amount_tx_count_24h": sum(
                    1
                    for other in rows_24h
                    if other["card_id"] == card_id and float(other["amount"]) >= HIGH_AMOUNT_LIMIT
                ),
                "same_card_same_device_count_24h": sum(
                    1 for other in device_24h if other["card_id"] == card_id
                )
                if device
                else 0,
            }
        )

    return df.join(pl.DataFrame(feature_rows), on="transaction_id", how="left")
