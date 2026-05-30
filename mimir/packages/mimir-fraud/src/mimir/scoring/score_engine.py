"""Core fraud scoring engine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import polars as pl

from mimir.core.constants import HIGH_AMOUNT_LIMIT, HIGH_RISK_CATEGORIES, SCORE_WEIGHTS
from mimir.core.schemas import ComponentScores, EngineSummary, TransactionReview, TransactionRisk
from mimir.scoring.normalize import clip01, scale_above, weighted_mean
from mimir.scoring.reason_engine import build_reasons, primary_pattern_from_reasons
from mimir.scoring.thresholds import score_to_risk_level, threshold_by_cost, threshold_for_profile


@dataclass(frozen=True)
class EngineResult:
    """In-memory output from one engine run."""

    feature_frame: pl.DataFrame
    risks: list[TransactionRisk]
    summary: EngineSummary


def _as_bool(value: Any) -> bool:
    return bool(value) if value is not None else False


def _component_scores(row: dict[str, Any]) -> ComponentScores:
    category = str(row["merchant_category"])
    amount = float(row["amount"])
    amount_ratio = float(row.get("amount_ratio_to_card_median") or 0.0)
    robust_z = abs(float(row.get("robust_z_log_amount") or 0.0))
    high_risk_category = category in HIGH_RISK_CATEGORIES

    card_baseline = weighted_mean(
        [
            (scale_above(robust_z, 2.5, 9.0), 1.4),
            (scale_above(amount_ratio, 3.0, 14.0), 1.5),
            (1.0 if _as_bool(row.get("category_is_new_for_card")) else 0.0, 1.0),
            (1.0 if _as_bool(row.get("merchant_is_new_for_card")) else 0.0, 0.7),
            (1.0 if _as_bool(row.get("device_is_new_for_card")) else 0.0, 1.1),
            (1.0 if _as_bool(row.get("ip_is_new_for_card")) else 0.0, 0.6),
            (1.0 if _as_bool(row.get("channel_is_unusual_for_card")) else 0.0, 0.8),
            (1.0 if _as_bool(row.get("merchant_country_is_unusual_for_card")) else 0.0, 0.8),
            (1.0 if _as_bool(row.get("country_mismatch")) else 0.0, 0.5),
            (1.0 if high_risk_category and amount >= HIGH_AMOUNT_LIMIT else 0.0, 1.4),
        ]
    )

    categorical_surprisal = weighted_mean(
        [
            (scale_above(float(row.get("merchant_category_card_surprisal") or 0.0), 1.1, 3.0), 1.1),
            (scale_above(float(row.get("merchant_name_card_surprisal") or 0.0), 1.4, 3.2), 1.0),
            (scale_above(float(row.get("device_id_card_surprisal") or 0.0), 1.0, 2.8), 0.7),
            (scale_above(float(row.get("ip_address_card_surprisal") or 0.0), 1.0, 2.8), 0.6),
            (scale_above(float(row.get("category_channel_country_combo_surprisal") or 0.0), 1.2, 3.1), 1.2),
            (scale_above(float(row.get("categorical_surprisal_raw") or 0.0), 1.2, 2.8), 1.0),
        ]
    )

    temporal_velocity = weighted_mean(
        [
            (scale_above(float(row.get("card_tx_count_10m") or 0), 2, 7), 1.2),
            (scale_above(float(row.get("card_tx_count_60m") or 0), 3, 11), 1.3),
            (scale_above(float(row.get("card_online_tx_count_60m") or 0), 2, 9), 1.2),
            (scale_above(float(row.get("card_small_tx_count_60m") or 0), 2, 9), 1.4),
            (scale_above(float(row.get("merchant_unique_cards_60m") or 0), 3, 8), 1.0),
            (scale_above(float(row.get("merchant_tx_count_60m") or 0), 3, 12), 0.8),
            (scale_above(float(row.get("same_card_same_merchant_count_60m") or 0), 2, 5), 0.8),
            (1.0 if _as_bool(row.get("same_card_same_amount_near_duplicate_24h")) else 0.0, 0.8),
            (1.0 if _as_bool(row.get("split_purchase_suspect")) else 0.0, 1.0),
            (scale_above(float(row.get("card_high_risk_tx_count_24h") or 0), 1, 4), 1.2),
            (scale_above(float(row.get("card_high_amount_tx_count_24h") or 0), 1, 4), 1.2),
            (scale_above(float(row.get("same_card_same_device_count_24h") or 0), 1, 4), 0.7),
        ]
    )
    if (
        str(row.get("channel")) == "online"
        and float(row.get("amount") or 0.0) <= 25
        and int(row.get("card_small_tx_count_60m") or 0) >= 6
        and int(row.get("card_online_tx_count_60m") or 0) >= 6
    ):
        temporal_velocity = max(temporal_velocity, 0.95)

    graph_collective = weighted_mean(
        [
            (float(row.get("merchant_burst_score") or 0.0), 1.4),
            (1.0 if _as_bool(row.get("unusual_merchant_hit_by_many_cards")) else 0.0, 1.4),
            (scale_above(float(row.get("merchant_unique_cards_24h") or 0), 6, 18), 0.7),
            (1.0 if _as_bool(row.get("shared_device_with_other_cards")) else 0.0, 1.2),
            (1.0 if _as_bool(row.get("shared_ip_with_other_cards")) else 0.0, 0.7),
            (scale_above(float(row.get("device_unique_cards_total") or 0), 1, 4), 0.8),
            (scale_above(float(row.get("ip_unique_cards_total") or 0), 1, 4), 0.7),
            (scale_above(float(row.get("ip_prefix_unique_cards_60m") or 0), 4, 10), 0.8),
            (1.0 if _as_bool(row.get("merchant_category_country_cluster_rarity")) and high_risk_category else 0.0, 0.9),
        ]
    )

    model_consensus = float(row.get("model_consensus_score") or 0.0)

    return ComponentScores(
        card_baseline=round(clip01(card_baseline), 4),
        categorical_surprisal=round(clip01(categorical_surprisal), 4),
        temporal_velocity=round(clip01(temporal_velocity), 4),
        graph_collective=round(clip01(graph_collective), 4),
        model_consensus=round(clip01(model_consensus), 4),
    )


def _final_score(component_scores: ComponentScores) -> float:
    weighted_raw = (
        SCORE_WEIGHTS["card_baseline"] * component_scores.card_baseline
        + SCORE_WEIGHTS["graph_collective"] * component_scores.graph_collective
        + SCORE_WEIGHTS["temporal_velocity"] * component_scores.temporal_velocity
        + SCORE_WEIGHTS["categorical_surprisal"] * component_scores.categorical_surprisal
        + SCORE_WEIGHTS["model_consensus"] * component_scores.model_consensus
    )
    # The component blend is intentionally conservative; calibrate it to the
    # reviewer-facing 0-1 scale without changing ranking.
    return round(clip01(weighted_raw / 0.55), 4)


def _recommended_action(risk_level: str, is_flagged: bool) -> str:
    if risk_level in {"critical", "high"}:
        return "escalate"
    if is_flagged:
        return "review"
    return "monitor"


def _contextual_score_adjustment(row: dict[str, Any], risk_score: float) -> float:
    """Apply conservative fraud-domain dampening for common benign novelty."""

    category = str(row.get("merchant_category") or "")
    amount = float(row.get("amount") or 0.0)
    temporal = float(row["component_scores"].temporal_velocity)
    graph = float(row["component_scores"].graph_collective)
    amount_ratio = float(row.get("amount_ratio_to_card_median") or 0.0)
    if (
        category in {"subscription", "utilities"}
        and amount <= 30
        and temporal < 0.15
        and graph < 0.15
        and amount_ratio < 3.0
    ):
        return round(risk_score * 0.65, 4)
    return risk_score


def score_feature_frame(
    feature_frame: pl.DataFrame,
    profile: str = "balanced",
    review_rate: float | None = None,
    false_positive_cost: float | None = None,
    false_negative_cost: float | None = None,
    review_status_by_transaction: dict[str, TransactionReview] | None = None,
) -> EngineResult:
    """Score an engineered feature frame and create renderable risk objects."""

    scored_records: list[dict[str, Any]] = []
    for row in feature_frame.to_dicts():
        component_scores = _component_scores(row)
        risk_score = _final_score(component_scores)
        row["component_scores"] = component_scores
        row["risk_score"] = _contextual_score_adjustment(row, risk_score)
        scored_records.append(row)

    scores = [float(row["risk_score"]) for row in scored_records]
    if false_positive_cost is not None and false_negative_cost is not None:
        threshold, effective_review_rate = threshold_by_cost(scores, false_positive_cost, false_negative_cost)
        profile_name = "cost_aware"
    elif review_rate is not None:
        from mimir.scoring.thresholds import threshold_by_review_rate

        effective_review_rate = max(0.0, min(1.0, float(review_rate)))
        threshold = threshold_by_review_rate(scores, effective_review_rate)
        profile_name = "custom"
    else:
        threshold, effective_review_rate = threshold_for_profile(scores, profile)
        profile_name = profile

    risks: list[TransactionRisk] = []
    for row in scored_records:
        risk_score = float(row["risk_score"])
        is_flagged = risk_score >= threshold
        risk_level = score_to_risk_level(risk_score)
        reasons = build_reasons(row, risk_score)
        if is_flagged and not reasons:
            reasons = build_reasons({**row, "model_consensus_score": 1.0}, max(risk_score, 0.42))
        primary_pattern = primary_pattern_from_reasons(reasons, row)
        review = (
            review_status_by_transaction.get(str(row["transaction_id"]), TransactionReview())
            if review_status_by_transaction
            else TransactionReview()
        )

        risks.append(
            TransactionRisk(
                transaction_id=str(row["transaction_id"]),
                timestamp=str(row["timestamp"]),
                card_id=str(row["card_id"]),
                amount=float(row["amount"]),
                merchant_name=str(row["merchant_name"]),
                merchant_category=str(row["merchant_category"]),
                channel=str(row["channel"]),
                cardholder_country=str(row["cardholder_country"]),
                merchant_country=str(row["merchant_country"]),
                device_id=str(row.get("device_id") or "") or None,
                ip_address=str(row.get("ip_address") or "") or None,
                risk_score=risk_score,
                risk_level=risk_level,  # type: ignore[arg-type]
                is_flagged=is_flagged,
                recommended_action=_recommended_action(risk_level, is_flagged),  # type: ignore[arg-type]
                primary_pattern=primary_pattern,
                component_scores=row["component_scores"],
                reasons=reasons,
                review=review,
            )
        )

    risks.sort(key=lambda risk: (-risk.risk_score, risk.transaction_id))
    risk_level_counts: dict[str, int] = {}
    primary_pattern_counts: dict[str, int] = {}
    for risk in risks:
        risk_level_counts[risk.risk_level] = risk_level_counts.get(risk.risk_level, 0) + 1
        if risk.is_flagged:
            primary_pattern_counts[risk.primary_pattern] = primary_pattern_counts.get(risk.primary_pattern, 0) + 1

    summary = EngineSummary(
        processed_rows=len(risks),
        flagged_rows=sum(1 for risk in risks if risk.is_flagged),
        review_rate=round(effective_review_rate, 4),
        threshold=round(float(threshold), 4),
        profile=profile_name,
        risk_level_counts=risk_level_counts,
        primary_pattern_counts=primary_pattern_counts,
    )

    score_columns = {
        risk.transaction_id: {
            "risk_score": risk.risk_score,
            "risk_level": risk.risk_level,
            "is_flagged": risk.is_flagged,
            "recommended_action": risk.recommended_action,
            "primary_pattern": risk.primary_pattern,
            "reason_codes": ";".join(reason.code for reason in risk.reasons),
        }
        for risk in risks
    }
    feature_with_scores = feature_frame.join(
        pl.DataFrame(
            [
                {"transaction_id": transaction_id, **values}
                for transaction_id, values in score_columns.items()
            ]
        ),
        on="transaction_id",
        how="left",
    )

    return EngineResult(feature_frame=feature_with_scores, risks=risks, summary=summary)
