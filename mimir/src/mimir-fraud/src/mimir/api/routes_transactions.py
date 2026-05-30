"""Pure transaction route handlers used by the standard-library API server."""

from __future__ import annotations

from mimir.scoring.score_engine import EngineResult


def get_summary(result: EngineResult) -> dict:
    return result.summary.model_dump(mode="json")


def get_transactions(result: EngineResult) -> list[dict]:
    return [risk.model_dump(mode="json") for risk in result.risks]


def get_queue(result: EngineResult) -> list[dict]:
    return [risk.model_dump(mode="json") for risk in result.risks if risk.is_flagged]
