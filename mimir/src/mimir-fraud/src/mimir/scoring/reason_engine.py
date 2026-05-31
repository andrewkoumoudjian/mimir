"""Reason generation for flagged and reviewable transactions."""

from __future__ import annotations

from typing import Any

from mimir.core.constants import HIGH_AMOUNT_LIMIT, HIGH_RISK_CATEGORIES, SMALL_AMOUNT_LIMIT
from mimir.core.schemas import Reason


def _reason(
    code: str,
    severity: str,
    message: str,
    evidence: dict[str, Any],
    priority: int,
) -> Reason:
    return Reason(
        code=code,
        severity=severity,  # type: ignore[arg-type]
        message=message,
        evidence=evidence,
        priority=priority,
    )


def build_reasons(row: dict[str, Any], risk_score: float) -> list[Reason]:
    """Build ordered, human-readable reasons from exact feature evidence."""

    amount = float(row["amount"])
    category = str(row["merchant_category"])
    channel = str(row["channel"])
    reasons: list[Reason] = []

    if (
        channel == "online"
        and amount <= SMALL_AMOUNT_LIMIT
        and int(row.get("card_small_tx_count_60m") or 0) >= 6
        and int(row.get("card_online_tx_count_60m") or 0) >= 6
    ):
        reasons.append(
            _reason(
                "CARD_TESTING_VELOCITY",
                "critical",
                (
                    f"{int(row['card_small_tx_count_60m'])} small online transactions "
                    "on this card within 60 minutes."
                ),
                {
                    "card_id": row["card_id"],
                    "small_tx_count_60m": int(row["card_small_tx_count_60m"]),
                    "online_tx_count_60m": int(row["card_online_tx_count_60m"]),
                    "amount": amount,
                },
                5,
            )
        )

    if bool(row.get("unusual_merchant_hit_by_many_cards")):
        reasons.append(
            _reason(
                "MERCHANT_BURST",
                "critical" if amount >= HIGH_AMOUNT_LIMIT else "high",
                (
                    f"{row['merchant_name']} saw {int(row['merchant_unique_cards_60m'])} "
                    "unique cards in a 60-minute window."
                ),
                {
                    "merchant_name": row["merchant_name"],
                    "merchant_unique_cards_60m": int(row["merchant_unique_cards_60m"]),
                    "merchant_tx_count_60m": int(row["merchant_tx_count_60m"]),
                },
                8,
            )
        )

    if category in HIGH_RISK_CATEGORIES and amount >= HIGH_AMOUNT_LIMIT:
        reasons.append(
            _reason(
                "HIGH_RISK_CATEGORY_AMOUNT",
                "critical" if category == "gift_card" else "high",
                f"High-value {category.replace('_', ' ')} transaction for CAD {amount:,.2f}.",
                {
                    "merchant_category": category,
                    "amount": amount,
                    "merchant_name": row["merchant_name"],
                },
                10,
            )
        )

    if int(row.get("card_high_risk_tx_count_24h") or 0) >= 2 and category in HIGH_RISK_CATEGORIES:
        reasons.append(
            _reason(
                "REPEATED_HIGH_RISK_CARD_ACTIVITY",
                "high",
                (
                    f"{int(row['card_high_risk_tx_count_24h'])} high-risk category "
                    "transactions on this card within 24 hours."
                ),
                {
                    "card_id": row["card_id"],
                    "card_high_risk_tx_count_24h": int(row["card_high_risk_tx_count_24h"]),
                    "same_card_same_device_count_24h": int(row.get("same_card_same_device_count_24h") or 0),
                },
                12,
            )
        )

    if bool(row.get("split_purchase_suspect")):
        reasons.append(
            _reason(
                "SPLIT_PURCHASE_PATTERN",
                "high",
                (
                    f"{int(row['same_card_same_merchant_count_60m'])} same-card "
                    "merchant transactions clustered within 60 minutes."
                ),
                {
                    "card_id": row["card_id"],
                    "merchant_name": row["merchant_name"],
                    "count_60m": int(row["same_card_same_merchant_count_60m"]),
                    "sum_60m": float(row["same_card_same_merchant_sum_60m"]),
                },
                15,
            )
        )

    if bool(row.get("same_card_same_amount_near_duplicate_24h")):
        reasons.append(
            _reason(
                "NEAR_DUPLICATE_TRANSACTION",
                "medium",
                "Similar amount at the same merchant appeared on this card within 24 hours.",
                {
                    "card_id": row["card_id"],
                    "merchant_name": row["merchant_name"],
                    "amount": amount,
                },
                18,
            )
        )

    if abs(float(row.get("robust_z_log_amount") or 0.0)) >= 3.5 or float(row.get("amount_ratio_to_card_median") or 0.0) >= 5:
        reasons.append(
            _reason(
                "AMOUNT_SPIKE_FOR_CARD",
                "high" if amount >= HIGH_AMOUNT_LIMIT else "medium",
                (
                    f"Amount is {float(row['amount_ratio_to_card_median']):.1f}x this "
                    "card's median transaction."
                ),
                {
                    "amount": amount,
                    "card_median_amount": float(row["card_median_amount"]),
                    "amount_ratio_to_card_median": float(row["amount_ratio_to_card_median"]),
                    "robust_z_log_amount": float(row["robust_z_log_amount"]),
                },
                20,
            )
        )

    if bool(row.get("device_is_new_for_card")):
        reasons.append(
            _reason(
                "NEW_DEVICE_FOR_CARD",
                "high" if amount >= HIGH_AMOUNT_LIMIT or category in HIGH_RISK_CATEGORIES else "medium",
                "First observed use of this device for the card.",
                {"card_id": row["card_id"], "device_id": row.get("device_id") or ""},
                25,
            )
        )

    if bool(row.get("ip_is_new_for_card")):
        reasons.append(
            _reason(
                "NEW_IP_FOR_CARD",
                "medium",
                "First observed use of this IP address for the card.",
                {"card_id": row["card_id"], "ip_address": row.get("ip_address") or ""},
                28,
            )
        )

    if bool(row.get("category_is_new_for_card")):
        reasons.append(
            _reason(
                "NEW_CATEGORY_FOR_CARD",
                "high" if category in HIGH_RISK_CATEGORIES else "medium",
                f"First observed {category.replace('_', ' ')} transaction category for this card.",
                {"card_id": row["card_id"], "merchant_category": category},
                30,
            )
        )

    if bool(row.get("merchant_is_new_for_card")):
        reasons.append(
            _reason(
                "NEW_MERCHANT_FOR_CARD",
                "medium",
                "First observed merchant for this card.",
                {"card_id": row["card_id"], "merchant_name": row["merchant_name"]},
                32,
            )
        )

    if bool(row.get("country_mismatch")):
        reasons.append(
            _reason(
                "COUNTRY_MISMATCH",
                "medium",
                "Merchant country differs from the cardholder country.",
                {
                    "cardholder_country": row["cardholder_country"],
                    "merchant_country": row["merchant_country"],
                },
                35,
            )
        )

    if bool(row.get("merchant_country_is_unusual_for_card")):
        reasons.append(
            _reason(
                "UNUSUAL_COUNTRY_FOR_CARD",
                "medium",
                "Merchant country is unusual for this card's history.",
                {"card_id": row["card_id"], "merchant_country": row["merchant_country"]},
                38,
            )
        )

    if int(row.get("ip_prefix_unique_cards_60m") or 0) >= 5:
        reasons.append(
            _reason(
                "IP_PREFIX_BURST",
                "medium",
                (
                    f"IP network {row.get('ip_prefix') or ''} touched "
                    f"{int(row['ip_prefix_unique_cards_60m'])} cards within 60 minutes."
                ),
                {
                    "ip_prefix": row.get("ip_prefix") or "",
                    "ip_prefix_unique_cards_60m": int(row["ip_prefix_unique_cards_60m"]),
                    "ip_prefix_tx_count_60m": int(row["ip_prefix_tx_count_60m"]),
                },
                40,
            )
        )

    if bool(row.get("shared_device_with_other_cards")):
        reasons.append(
            _reason(
                "SHARED_DEVICE_ACROSS_CARDS",
                "critical",
                f"Device used by {int(row['device_unique_cards_total'])} different cards.",
                {
                    "device_id": row.get("device_id") or "",
                    "device_unique_cards_total": int(row["device_unique_cards_total"]),
                },
                42,
            )
        )

    if bool(row.get("shared_ip_with_other_cards")):
        reasons.append(
            _reason(
                "SHARED_IP_ACROSS_CARDS",
                "medium",
                f"IP address used by {int(row['ip_unique_cards_total'])} different cards.",
                {
                    "ip_address": row.get("ip_address") or "",
                    "ip_unique_cards_total": int(row["ip_unique_cards_total"]),
                },
                44,
            )
        )

    if bool(row.get("merchant_category_country_cluster_rarity")) and category in HIGH_RISK_CATEGORIES:
        reasons.append(
            _reason(
                "RARE_MERCHANT_CATEGORY_COUNTRY",
                "medium",
                "Rare merchant/category/country combination in this dataset.",
                {
                    "merchant_name": row["merchant_name"],
                    "merchant_category": category,
                    "merchant_country": row["merchant_country"],
                    "cluster_count": int(row["merchant_category_country_cluster_count"]),
                },
                48,
            )
        )

    xfraud_score = float(row.get("xfraud_graph_score") or 0.0)
    if xfraud_score >= 0.72:
        reasons.append(
            _reason(
                "XFRAUD_GRAPH_SCORE",
                "high" if xfraud_score >= 0.85 else "medium",
                f"xFraud graph model scored this transaction at {xfraud_score:.2f}.",
                {
                    "xfraud_graph_score": round(xfraud_score, 4),
                    "pseudo_label": int(row.get("xfraud_pseudo_label") or -1),
                    "pseudo_label_source": row.get("xfraud_label_source") or "unlabeled_scored",
                    "training_seed_count": int(row.get("xfraud_training_seed_count") or 0),
                    "validation_auc": round(float(row.get("xfraud_valid_auc") or 0.5), 4),
                    "pseudo_label_policy": "reviewer feedback overrides high-confidence heuristic pseudo-labels",
                },
                50,
            )
        )

    if not reasons and risk_score >= 0.42:
        reasons.append(
            _reason(
                "ELEVATED_COMPOSITE_RISK",
                "medium",
                "Multiple weak anomaly signals combine into an elevated risk score.",
                {
                    "risk_score": round(risk_score, 4),
                    "model_consensus_score": float(row.get("model_consensus_score") or 0.0),
                },
                80,
            )
        )

    return sorted(reasons, key=lambda reason: reason.priority)[:5]


def primary_pattern_from_reasons(reasons: list[Reason], row: dict[str, Any]) -> str:
    """Map reason codes to the product-facing fraud pattern."""

    codes = {reason.code for reason in reasons}
    if "CARD_TESTING_VELOCITY" in codes:
        return "card_testing"
    if "MERCHANT_BURST" in codes:
        return "merchant_burst"
    if "HIGH_RISK_CATEGORY_AMOUNT" in codes or "REPEATED_HIGH_RISK_CARD_ACTIVITY" in codes:
        return "account_takeover_purchase"
    if "SHARED_DEVICE_ACROSS_CARDS" in codes or "SHARED_IP_ACROSS_CARDS" in codes:
        return "shared_instrument"
    if "XFRAUD_GRAPH_SCORE" in codes:
        return "xfraud_graph_anomaly"
    if "AMOUNT_SPIKE_FOR_CARD" in codes:
        return "card_baseline_anomaly"
    if float(row.get("model_consensus_score") or 0.0) >= 0.90:
        return "model_consensus"
    return "elevated_risk"
