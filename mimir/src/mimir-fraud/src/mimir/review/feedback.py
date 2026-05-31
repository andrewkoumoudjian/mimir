"""Session feedback adjustment derived from reviewer decisions."""

from __future__ import annotations

from mimir.core.schemas import Reason, TransactionRisk
from mimir.review.review_state import ReviewState
from mimir.scoring.thresholds import score_to_risk_level


NEGATIVE_FEEDBACK_STATUSES = {"approved", "dismissed"}
WEAK_POSITIVE_FEEDBACK_STATUSES = {"escalated"}
POSITIVE_FEEDBACK_STATUSES = {"declined", "blocked"}


def apply_session_feedback_adjustments(
    risks: list[TransactionRisk],
    state: ReviewState,
    threshold: float,
) -> list[TransactionRisk]:
    """Adjust pending scores from reviewer feedback inside the current session.

    These adjustments are intentionally local to the live queue. They make reviewer
    feedback visible immediately while the production model remains versioned and gated.
    """

    negative_pairs = set()
    weak_positive_pairs = set()
    positive_pairs = set()
    for risk in risks:
        review = state.reviews.get(risk.transaction_id)
        pair = (risk.merchant_name, risk.merchant_category)
        if review and review.status in NEGATIVE_FEEDBACK_STATUSES:
            negative_pairs.add(pair)
        if review and review.status in WEAK_POSITIVE_FEEDBACK_STATUSES:
            weak_positive_pairs.add(pair)
        if review and review.status in POSITIVE_FEEDBACK_STATUSES:
            positive_pairs.add(pair)

    if not negative_pairs and not weak_positive_pairs and not positive_pairs:
        return risks

    adjusted: list[TransactionRisk] = []
    for risk in risks:
        review = state.reviews.get(risk.transaction_id)
        if review and review.status != "pending":
            adjusted.append(risk)
            continue
        pair = (risk.merchant_name, risk.merchant_category)
        if pair in positive_pairs:
            _adjust_score(
                risk,
                delta=0.12,
                threshold=threshold,
                reason=Reason(
                    code="SESSION_FEEDBACK_POSITIVE_BOOST",
                    severity="medium",
                    message="Score changed because similar transactions were declined or blocked in this review session.",
                    evidence={"merchant_name": risk.merchant_name, "merchant_category": risk.merchant_category},
                    priority=18,
                ),
            )
        elif pair in weak_positive_pairs:
            _adjust_score(
                risk,
                delta=0.06,
                threshold=threshold,
                reason=Reason(
                    code="SESSION_FEEDBACK_WEAK_POSITIVE_BOOST",
                    severity="medium",
                    message="Score changed because similar transactions were escalated in this review session.",
                    evidence={"merchant_name": risk.merchant_name, "merchant_category": risk.merchant_category},
                    priority=24,
                ),
            )
        elif pair in negative_pairs:
            _adjust_score(
                risk,
                delta=-0.08,
                threshold=threshold,
                reason=Reason(
                    code="SESSION_FEEDBACK_SUPPRESSION",
                    severity="low",
                    message="Score changed because similar transactions were approved or dismissed in this review session.",
                    evidence={"merchant_name": risk.merchant_name, "merchant_category": risk.merchant_category},
                    priority=90,
                ),
            )
        adjusted.append(risk)
    return sorted(adjusted, key=lambda item: (-item.risk_score, item.transaction_id))


def apply_feedback_suppression(risks: list[TransactionRisk], state: ReviewState) -> list[TransactionRisk]:
    """Backward-compatible wrapper for callers that only need suppression."""

    dismissed_pairs = set()
    for risk in risks:
        review = state.reviews.get(risk.transaction_id)
        if review and review.status == "dismissed":
            dismissed_pairs.add((risk.merchant_name, risk.merchant_category))

    if not dismissed_pairs:
        return risks

    adjusted: list[TransactionRisk] = []
    for risk in risks:
        review = state.reviews.get(risk.transaction_id)
        if review and review.status != "pending":
            adjusted.append(risk)
            continue
        if (risk.merchant_name, risk.merchant_category) in dismissed_pairs:
            risk.risk_score = max(0.0, round(risk.risk_score - 0.08, 4))
            risk.reasons.append(
                Reason(
                    code="SESSION_FEEDBACK_SUPPRESSION",
                    severity="low",
                    message="Score changed because similar transactions were dismissed in this review session.",
                    evidence={"merchant_name": risk.merchant_name, "merchant_category": risk.merchant_category},
                    priority=90,
                )
            )
        adjusted.append(risk)
    return sorted(adjusted, key=lambda item: (-item.risk_score, item.transaction_id))


def _adjust_score(risk: TransactionRisk, delta: float, threshold: float, reason: Reason) -> None:
    risk.risk_score = max(0.0, min(1.0, round(risk.risk_score + delta, 4)))
    risk.risk_level = score_to_risk_level(risk.risk_score)  # type: ignore[assignment]
    risk.is_flagged = risk.risk_score >= threshold
    risk.recommended_action = _recommended_action(risk.risk_level, risk.is_flagged)  # type: ignore[assignment]
    if not any(existing.code == reason.code for existing in risk.reasons):
        risk.reasons.append(reason)


def _recommended_action(risk_level: str, is_flagged: bool) -> str:
    if risk_level in {"critical", "high"}:
        return "escalate"
    if is_flagged:
        return "review"
    return "monitor"
