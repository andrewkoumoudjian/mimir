"""JSON exports for reviewer-ready frontend/API data."""

from __future__ import annotations

import json
from pathlib import Path

from mimir.core.schemas import EngineSummary, TransactionRisk


def export_risk_json(
    risks: list[TransactionRisk],
    summary: EngineSummary,
    output_path: str | Path,
) -> Path:
    """Write a renderable JSON payload."""

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "summary": summary.model_dump(mode="json"),
        "queue": [risk.model_dump(mode="json") for risk in risks if risk.is_flagged],
        "transactions": [risk.model_dump(mode="json") for risk in risks],
    }
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)
    return path


def export_review_queue_json(risks: list[TransactionRisk], output_path: str | Path) -> Path:
    """Write only the flagged queue."""

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump([risk.model_dump(mode="json") for risk in risks if risk.is_flagged], file, indent=2)
    return path
