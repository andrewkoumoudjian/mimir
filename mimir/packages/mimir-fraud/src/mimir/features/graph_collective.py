"""Explainable graph and cross-card collective anomaly features."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import timedelta
from typing import Any

import polars as pl


def _ip_prefix(ip_address: str) -> str:
    parts = ip_address.split(".")
    if len(parts) >= 2:
        return ".".join(parts[:2])
    return ip_address


def add_graph_collective_features(df: pl.DataFrame) -> pl.DataFrame:
    """Add graph-derived features without requiring a GNN."""

    records = df.to_dicts()
    device_cards: dict[str, set[str]] = defaultdict(set)
    ip_cards: dict[str, set[str]] = defaultdict(set)
    merchant_cards: dict[str, set[str]] = defaultdict(set)
    cluster_counts: Counter[tuple[str, str, str]] = Counter()

    for row in records:
        card_id = str(row["card_id"])
        device = str(row.get("device_id") or "")
        ip_address = str(row.get("ip_address") or "")
        merchant = str(row["merchant_name"])
        if device:
            device_cards[device].add(card_id)
        if ip_address:
            ip_cards[ip_address].add(card_id)
        merchant_cards[merchant].add(card_id)
        cluster_counts[
            (str(row["merchant_name"]), str(row["merchant_category"]), str(row["merchant_country"]))
        ] += 1

    feature_rows: list[dict[str, Any]] = []
    for row in records:
        timestamp = row["_timestamp_dt"]
        device = str(row.get("device_id") or "")
        ip_address = str(row.get("ip_address") or "")
        merchant = str(row["merchant_name"])
        category = str(row["merchant_category"])
        country = str(row["merchant_country"])
        ip_prefix = _ip_prefix(ip_address) if ip_address else ""

        rows_24h = [
            other
            for other in records
            if abs(other["_timestamp_dt"] - timestamp) <= timedelta(hours=24)
        ]
        rows_60m = [
            other
            for other in records
            if abs(other["_timestamp_dt"] - timestamp) <= timedelta(minutes=60)
        ]

        merchant_24h = [other for other in rows_24h if other["merchant_name"] == merchant]
        device_24h = [
            other for other in rows_24h if device and (other.get("device_id") or "") == device
        ]
        ip_24h = [
            other for other in rows_24h if ip_address and (other.get("ip_address") or "") == ip_address
        ]
        prefix_60m = [
            other
            for other in rows_60m
            if ip_prefix and _ip_prefix(str(other.get("ip_address") or "")) == ip_prefix
        ]

        merchant_unique_cards_60m = len(
            {other["card_id"] for other in rows_60m if other["merchant_name"] == merchant}
        )
        merchant_tx_count_60m = sum(1 for other in rows_60m if other["merchant_name"] == merchant)
        cluster_count = cluster_counts[(merchant, category, country)]
        rare_cluster = cluster_count <= 4

        feature_rows.append(
            {
                "transaction_id": row["transaction_id"],
                "device_unique_cards_total": len(device_cards[device]) if device else 0,
                "ip_unique_cards_total": len(ip_cards[ip_address]) if ip_address else 0,
                "merchant_unique_cards_total": len(merchant_cards[merchant]),
                "device_unique_cards_24h": len({other["card_id"] for other in device_24h}) if device else 0,
                "ip_unique_cards_24h": len({other["card_id"] for other in ip_24h}) if ip_address else 0,
                "merchant_unique_cards_24h": len({other["card_id"] for other in merchant_24h}),
                "merchant_burst_score": round(
                    min(1.0, max(0.0, (merchant_unique_cards_60m - 2) / 6 + (merchant_tx_count_60m - 3) / 18)),
                    4,
                ),
                "shared_device_with_other_cards": bool(device) and len(device_cards[device]) > 1,
                "shared_ip_with_other_cards": bool(ip_address) and len(ip_cards[ip_address]) > 1,
                "unusual_merchant_hit_by_many_cards": merchant_unique_cards_60m >= 5 and merchant_tx_count_60m >= 5,
                "merchant_category_country_cluster_rarity": rare_cluster,
                "merchant_category_country_cluster_count": cluster_count,
                "ip_prefix": ip_prefix,
                "ip_prefix_unique_cards_60m": len({other["card_id"] for other in prefix_60m}) if ip_prefix else 0,
                "ip_prefix_tx_count_60m": len(prefix_60m) if ip_prefix else 0,
            }
        )

    return df.join(pl.DataFrame(feature_rows), on="transaction_id", how="left")
