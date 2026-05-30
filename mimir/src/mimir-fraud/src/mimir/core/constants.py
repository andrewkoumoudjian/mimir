"""Shared constants for Mimir's Valsoft-first fraud engine."""

from __future__ import annotations

REQUIRED_TRANSACTION_COLUMNS = (
    "transaction_id",
    "timestamp",
    "card_id",
    "amount",
    "merchant_name",
    "merchant_category",
    "channel",
    "cardholder_country",
    "merchant_country",
    "device_id",
    "ip_address",
)

SCORE_WEIGHTS = {
    "card_baseline": 0.30,
    "graph_collective": 0.25,
    "temporal_velocity": 0.20,
    "categorical_surprisal": 0.15,
    "model_consensus": 0.10,
}

REVIEW_RATE_PROFILES = {
    "conservative": 0.05,
    "balanced": 0.08,
    "aggressive": 0.12,
}

DEFAULT_PROFILE = "balanced"
DEFAULT_REVIEW_RATE = REVIEW_RATE_PROFILES[DEFAULT_PROFILE]

HIGH_RISK_CATEGORIES = {"gift_card", "electronics", "travel"}
SMALL_AMOUNT_LIMIT = 25.0
HIGH_AMOUNT_LIMIT = 300.0

EPSILON = 1e-9
