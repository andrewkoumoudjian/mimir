"""Pure review route handlers for approve/dismiss/escalate/undo."""

from __future__ import annotations

from pathlib import Path

from mimir.core.schemas import ReviewerDecision
from mimir.review.review_state import ReviewState


def apply_decision(
    body: dict,
    state: ReviewState,
    state_path: str | Path,
    audit_log_path: str | Path,
) -> dict:
    decision = ReviewerDecision(**body)
    event = state.action(
        decision.transaction_id,
        decision.action,
        reviewer=decision.reviewer,
        note=decision.note,
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
