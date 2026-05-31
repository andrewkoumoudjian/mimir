"""Pure transaction route handlers used by the standard-library API server."""

from __future__ import annotations

from mimir.context import build_card_timeline, build_entity_context, build_graph, build_transaction_context
from mimir.scoring.score_engine import EngineResult


def get_summary(result: EngineResult) -> dict:
    return result.summary.model_dump(mode="json")


def get_transactions(result: EngineResult) -> list[dict]:
    return [risk.model_dump(mode="json") for risk in result.risks]


def get_queue(result: EngineResult) -> list[dict]:
    return [risk.model_dump(mode="json") for risk in result.risks if risk.is_flagged]


def get_transaction_context(result: EngineResult, transaction_id: str) -> dict:
    return build_transaction_context(result, transaction_id)


def get_entity(result: EngineResult, entity_type: str, entity_id: str) -> dict:
    return build_entity_context(result, entity_type, entity_id)


def get_card_timeline(result: EngineResult, card_id: str) -> list[dict]:
    return build_card_timeline(result, card_id)


def get_graph(result: EngineResult, transaction_id: str | None = None) -> dict:
    return build_graph(result, transaction_id)
