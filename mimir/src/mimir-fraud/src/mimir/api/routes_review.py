"""Pure review route handlers for approve/dismiss/escalate/undo."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from mimir.core.schemas import ReviewerDecision
from mimir.review.review_state import ReviewState


def apply_decision(
    body: dict,
    state: ReviewState,
    state_path: str | Path,
    audit_log_path: str | Path,
    feedback_context: dict[str, Any] | None = None,
) -> dict:
    decision = ReviewerDecision(**body)
    feedback_context = feedback_context or {}
    event = state.action(
        decision.transaction_id,
        decision.action,
        reviewer=decision.reviewer,
        reviewer_confidence=decision.reviewer_confidence,
        note=decision.note,
        feature_snapshot=feedback_context.get("feature_snapshot"),
        original_score=feedback_context.get("original_score"),
        original_reasons=feedback_context.get("original_reasons"),
        model_version=feedback_context.get("model_version"),
        audit_log_path=audit_log_path,
    )
    state.save(state_path)
    return {"ok": True, "event": event.model_dump(mode="json")}


def undo_last(
    state: ReviewState,
    state_path: str | Path,
    audit_log_path: str | Path,
) -> dict:
    event = state.undo(audit_log_path=audit_log_path)
    state.save(state_path)
    if event is None:
        return {"ok": False, "message": "No review actions to undo."}
    return {"ok": True, "event": event.model_dump(mode="json")}
