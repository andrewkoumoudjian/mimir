"""Thresholding utilities for reviewer queue sizing and risk levels."""

from __future__ import annotations

from mimir.core.constants import DEFAULT_REVIEW_RATE, REVIEW_RATE_PROFILES


def score_to_risk_level(score: float) -> str:
    """Map a normalized risk score to a reviewer-friendly level."""

    if score >= 0.82:
        return "critical"
    if score >= 0.66:
        return "high"
    if score >= 0.42:
        return "medium"
    return "low"


def threshold_by_review_rate(scores: list[float], rate: float = DEFAULT_REVIEW_RATE) -> float:
    """Return the score threshold that flags roughly the requested review rate."""

    if not scores:
        return 1.0
    clamped_rate = max(0.0, min(1.0, rate))
    if clamped_rate <= 0:
        return 1.0
    sorted_scores = sorted(scores, reverse=True)
    index = min(len(sorted_scores) - 1, max(0, int(round(len(sorted_scores) * clamped_rate)) - 1))
    return sorted_scores[index]


def threshold_for_profile(scores: list[float], profile: str) -> tuple[float, float]:
    """Return (threshold, review_rate) for a named queue profile."""

    rate = REVIEW_RATE_PROFILES.get(profile, DEFAULT_REVIEW_RATE)
    return threshold_by_review_rate(scores, rate), rate


def threshold_by_cost(
    scores: list[float],
    false_positive_cost: float,
    false_negative_cost: float,
) -> tuple[float, float]:
    """Convert review-cost preferences into a practical threshold.

    Higher missed-fraud cost expands the queue. Higher false-positive cost shrinks it.
    The rate is intentionally bounded for a 1,000-row human review workflow.
    """

    fp_cost = max(0.01, float(false_positive_cost))
    fn_cost = max(0.01, float(false_negative_cost))
    missed_fraud_pressure = fn_cost / (fp_cost + fn_cost)
    review_rate = 0.03 + 0.17 * missed_fraud_pressure
    review_rate = max(0.03, min(0.20, review_rate))
    return threshold_by_review_rate(scores, review_rate), review_rate
