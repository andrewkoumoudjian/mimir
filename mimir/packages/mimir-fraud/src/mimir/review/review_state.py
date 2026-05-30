"""File-backed reviewer workflow state."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

from mimir.core.schemas import ReviewHistoryEvent, ReviewStatus, ReviewerAction, TransactionReview
from mimir.review.audit_log import append_audit_event


ACTION_TO_STATUS: dict[ReviewerAction, ReviewStatus] = {
    "approve": "approved",
    "dismiss": "dismissed",
    "escalate": "escalated",
}


class ReviewState(BaseModel):
    """Serializable review state for a local demo session."""

    reviews: dict[str, TransactionReview] = Field(default_factory=dict)
    undo_stack: list[ReviewHistoryEvent] = Field(default_factory=list)

    @classmethod
    def load(cls, path: str | Path) -> "ReviewState":
        state_path = Path(path)
        if not state_path.exists():
            return cls()
        with state_path.open("r", encoding="utf-8") as file:
            return cls(**json.load(file))

    def save(self, path: str | Path) -> None:
        state_path = Path(path)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        with state_path.open("w", encoding="utf-8") as file:
            json.dump(self.model_dump(mode="json"), file, indent=2)

    def action(
        self,
        transaction_id: str,
        action: ReviewerAction,
        reviewer: str = "local_reviewer",
        note: str | None = None,
        audit_log_path: str | Path | None = None,
    ) -> ReviewHistoryEvent:
        current = self.reviews.get(transaction_id, TransactionReview())
        to_status = ACTION_TO_STATUS[action]
        event = ReviewHistoryEvent(
            transaction_id=transaction_id,
            action=action,
            from_status=current.status,
            to_status=to_status,
            reviewer=reviewer,
            note=note,
        )
        current.status = to_status
        current.history.append(event)
        self.reviews[transaction_id] = current
        self.undo_stack.append(event)
        if audit_log_path is not None:
            append_audit_event(audit_log_path, event)
        return event

    def undo(self, audit_log_path: str | Path | None = None) -> ReviewHistoryEvent | None:
        if not self.undo_stack:
            return None
        last_event = self.undo_stack.pop()
        current = self.reviews.get(last_event.transaction_id, TransactionReview())
        undo_event = ReviewHistoryEvent(
            transaction_id=last_event.transaction_id,
            action=f"undo:{last_event.action}",
            from_status=current.status,
            to_status=last_event.from_status,
            reviewer=last_event.reviewer,
            note=last_event.note,
        )
        current.status = last_event.from_status
        current.history.append(undo_event)
        self.reviews[last_event.transaction_id] = current
        if audit_log_path is not None:
            append_audit_event(audit_log_path, undo_event)
        return undo_event
