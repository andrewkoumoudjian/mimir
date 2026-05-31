"""Reviewer-feedback training status for human-gated model updates."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Iterable

from mimir.core.constants import CURRENT_MODEL_VERSION
from mimir.core.schemas import ReviewHistoryEvent, ReviewStatus, TrainingLabel
from mimir.review.review_state import ReviewState


STATUS_TO_TRAINING_LABEL: dict[ReviewStatus, TrainingLabel | None] = {
    "pending": None,
    "approved": "negative",
    "dismissed": "negative",
    "escalated": "weak_positive",
    "declined": "positive",
    "blocked": "positive",
}
MIN_PROMOTION_GATE_DECISIONS = 5


def build_training_status(
    state: ReviewState,
    audit_events: Iterable[ReviewHistoryEvent] | None = None,
    *,
    xfraud_available: bool,
    current_model_version: str = CURRENT_MODEL_VERSION,
) -> dict:
    """Build a transparent status object for async candidate retraining.

    The MVP does not promote a model in-process. It exposes whether reviewer labels
    are sufficient to train a candidate and keeps production promotion gated.
    """

    active_labels = [
        label
        for review in state.reviews.values()
        if (label := STATUS_TO_TRAINING_LABEL.get(review.status)) is not None
    ]
    label_counts = Counter(active_labels)
    decision_count = len(active_labels)
    final_label_count = label_counts["positive"] + label_counts["negative"]
    has_label_balance = label_counts["positive"] > 0 and label_counts["negative"] > 0
    candidate_status = _candidate_status(final_label_count, has_label_balance)
    last_feedback_at = _last_feedback_at(audit_events)

    return {
        "learning_state": "active" if xfraud_available else "fallback",
        "current_model_version": current_model_version,
        "reviewer_feedback": {
            "decision_count": decision_count,
            "eligible_decision_count": final_label_count,
            "label_counts": {
                "positive": label_counts["positive"],
                "negative": label_counts["negative"],
                "weak_positive": label_counts["weak_positive"],
            },
            "last_feedback_at": last_feedback_at,
        },
        "candidate_model": {
            "status": candidate_status,
            "version": f"{current_model_version}-candidate-{max(final_label_count, 1)}",
            "source": "review_state_and_audit_log",
            "pending_validation": candidate_status == "pending_validation",
        },
        "promotion_gates": {
            "passed": False,
            "required": [
                "precision_recall_improvement",
                "known_guardrail_no_degradation",
                "reviewer_bias_check",
            ],
            "guardrail_cases": [
                "known_high_risk_gift_card",
                "known_low_risk_restaurant",
            ],
        },
    }


def _candidate_status(final_label_count: int, has_label_balance: bool) -> str:
    if final_label_count < MIN_PROMOTION_GATE_DECISIONS:
        return "collecting_feedback"
    if not has_label_balance:
        return "needs_label_balance"
    return "pending_validation"


def _last_feedback_at(audit_events: Iterable[ReviewHistoryEvent] | None) -> str | None:
    if audit_events is None:
        return None
    latest: datetime | None = None
    for event in audit_events:
        if event.action.startswith("undo:"):
            continue
        created_at = event.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        if latest is None or created_at > latest:
            latest = created_at
    if latest is None:
        return None
    if latest.tzinfo is None:
        latest = latest.replace(tzinfo=UTC)
    return latest.isoformat()
