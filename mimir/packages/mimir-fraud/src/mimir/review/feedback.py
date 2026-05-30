"""Session feedback adjustment derived from reviewer decisions."""

from __future__ import annotations

from mimir.core.schemas import Reason, TransactionRisk
from mimir.review.review_state import ReviewState


def apply_feedback_suppression(risks: list[TransactionRisk], state: ReviewState) -> list[TransactionRisk]:
    """Suppress similar pending flags after reviewer dismissals in a session.

    The feedback loop is deliberately simple: dismissed merchant/category pairs reduce
    priority for pending transactions with the same pair. The raw risk score remains
    visible for auditability.
    """

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
                    message="Similar merchant/category was dismissed earlier in this review session.",
                    evidence={
                        "merchant_name": risk.merchant_name,
                        "merchant_category": risk.merchant_category,
                    },
                    priority=90,
                )
            )
        adjusted.append(risk)
    return sorted(adjusted, key=lambda item: (-item.risk_score, item.transaction_id))
