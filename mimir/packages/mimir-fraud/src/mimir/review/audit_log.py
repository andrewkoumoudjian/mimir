"""Append-only audit log utilities."""

from __future__ import annotations

import json
from pathlib import Path

from mimir.core.schemas import ReviewHistoryEvent


def append_audit_event(path: str | Path, event: ReviewHistoryEvent) -> None:
    """Append one audit event as JSONL."""

    audit_path = Path(path)
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    with audit_path.open("a", encoding="utf-8") as file:
        file.write(event.model_dump_json() + "\n")


def read_audit_events(path: str | Path) -> list[ReviewHistoryEvent]:
    """Read JSONL audit events if present."""

    audit_path = Path(path)
    if not audit_path.exists():
        return []
    events: list[ReviewHistoryEvent] = []
    with audit_path.open("r", encoding="utf-8") as file:
        for line in file:
            if not line.strip():
                continue
            events.append(ReviewHistoryEvent(**json.loads(line)))
    return events
