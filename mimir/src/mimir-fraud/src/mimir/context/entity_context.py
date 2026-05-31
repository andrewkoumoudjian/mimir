"""Transaction and entity context builders for API and CLI contracts."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from mimir.core.schemas import (
    EntityContext,
    EntityLink,
    EntityType,
    GraphEdge,
    GraphNode,
    TimelineItem,
    TransactionContext,
    TransactionGraph,
    TransactionRisk,
)
from mimir.scoring.score_engine import EngineResult


ENTITY_TYPES: set[str] = {"transaction", "card", "merchant", "device", "ip", "category_country_cluster"}


def build_transaction_context(result: EngineResult, transaction_id: str) -> dict[str, Any]:
    """Return transaction-rooted entity context."""

    risk = _risk_by_id(result)[transaction_id]
    links = _transaction_links(risk)
    graph = _graph_for_transaction(result, risk)
    related = {
        "card": _timeline_items(_matching(result.risks, "card", risk.card_id, exclude=transaction_id), limit=20),
        "merchant": _timeline_items(_matching(result.risks, "merchant", risk.merchant_name, exclude=transaction_id), limit=20),
        "device": _timeline_items(_matching(result.risks, "device", risk.device_id or "", exclude=transaction_id), limit=20),
        "ip": _timeline_items(_matching(result.risks, "ip", risk.ip_address or "", exclude=transaction_id), limit=20),
        "category_country_cluster": _timeline_items(
            _matching(result.risks, "category_country_cluster", _cluster_id(risk), exclude=transaction_id),
            limit=20,
        ),
    }
    context = TransactionContext(
        transaction=risk.model_dump(mode="json"),
        links=links,
        card_timeline=_timeline_items(_matching(result.risks, "card", risk.card_id), limit=100),
        related_transactions=related,
        graph=graph,
    )
    return context.model_dump(mode="json")


def build_entity_context(result: EngineResult, entity_type: str, entity_id: str) -> dict[str, Any]:
    """Return entity-rooted transactions and graph context."""

    normalized_type = _normalize_entity_type(entity_type)
    risks = _matching(result.risks, normalized_type, entity_id)
    label = _entity_label(normalized_type, entity_id)
    links = [
        EntityLink(
            source_type=normalized_type,
            source_id=entity_id,
            target_type="transaction",
            target_id=risk.transaction_id,
            relation="related_transaction",
            label=f"related transaction {risk.transaction_id}",
        )
        for risk in risks[:100]
    ]
    context = EntityContext(
        entity_type=normalized_type,
        entity_id=entity_id,
        label=label,
        links=links,
        transactions=_timeline_items(risks, limit=100),
        graph=_graph_for_entity(result, normalized_type, entity_id, risks),
    )
    return context.model_dump(mode="json")


def build_card_timeline(result: EngineResult, card_id: str) -> list[dict[str, Any]]:
    """Return a card transaction timeline."""

    return [item.model_dump(mode="json") for item in _timeline_items(_matching(result.risks, "card", card_id), limit=500)]


def build_graph(result: EngineResult, transaction_id: str | None = None) -> dict[str, Any]:
    """Return a transaction-rooted graph, or a compact flagged graph."""

    if transaction_id:
        return _graph_for_transaction(result, _risk_by_id(result)[transaction_id]).model_dump(mode="json")
    flagged = [risk for risk in result.risks if risk.is_flagged][:60]
    return _graph_for_entity(result, "transaction", "flagged_queue", flagged).model_dump(mode="json")


def _risk_by_id(result: EngineResult) -> dict[str, TransactionRisk]:
    return {risk.transaction_id: risk for risk in result.risks}


def _transaction_links(risk: TransactionRisk) -> list[EntityLink]:
    links = [
        _link(risk, "card", risk.card_id, "uses_card", f"card {risk.card_id}"),
        _link(risk, "merchant", risk.merchant_name, "paid_merchant", risk.merchant_name),
        _link(
            risk,
            "category_country_cluster",
            _cluster_id(risk),
            "in_category_country_cluster",
            f"{risk.merchant_category}/{risk.merchant_country}",
        ),
    ]
    if risk.device_id:
        links.append(_link(risk, "device", risk.device_id, "used_device", f"device {risk.device_id}"))
    if risk.ip_address:
        links.append(_link(risk, "ip", risk.ip_address, "used_ip", f"IP {risk.ip_address}"))
    return links


def _link(risk: TransactionRisk, entity_type: EntityType, entity_id: str, relation: str, label: str) -> EntityLink:
    return EntityLink(
        source_type="transaction",
        source_id=risk.transaction_id,
        target_type=entity_type,
        target_id=entity_id,
        relation=relation,
        label=label,
    )


def _matching(
    risks: list[TransactionRisk],
    entity_type: str,
    entity_id: str,
    exclude: str | None = None,
) -> list[TransactionRisk]:
    if not entity_id:
        return []
    normalized_type = _normalize_entity_type(entity_type)
    matches = []
    for risk in risks:
        if exclude and risk.transaction_id == exclude:
            continue
        if _entity_value(risk, normalized_type) == entity_id:
            matches.append(risk)
    return sorted(matches, key=lambda risk: (risk.timestamp, risk.transaction_id))


def _timeline_items(risks: list[TransactionRisk], limit: int) -> list[TimelineItem]:
    sorted_risks = sorted(risks, key=lambda risk: (risk.timestamp, risk.transaction_id))
    return [
        TimelineItem(
            transaction_id=risk.transaction_id,
            timestamp=risk.timestamp,
            amount=risk.amount,
            merchant_name=risk.merchant_name,
            merchant_category=risk.merchant_category,
            risk_score=risk.risk_score,
            risk_level=risk.risk_level,
            is_flagged=risk.is_flagged,
            review_status=risk.review.status,
            primary_pattern=risk.primary_pattern,
        )
        for risk in sorted_risks[:limit]
    ]


def _graph_for_transaction(result: EngineResult, root: TransactionRisk) -> TransactionGraph:
    candidate_ids = {root.transaction_id}
    for entity_type, entity_id in _entity_pairs(root):
        for risk in _matching(result.risks, entity_type, entity_id, exclude=root.transaction_id):
            if risk.is_flagged or risk.risk_score >= max(0.55, root.risk_score - 0.12):
                candidate_ids.add(risk.transaction_id)
    candidates = [_risk_by_id(result)[tx_id] for tx_id in candidate_ids if tx_id in _risk_by_id(result)]
    return _build_graph(candidates, selected_transaction_id=root.transaction_id)


def _graph_for_entity(
    result: EngineResult,
    entity_type: str,
    entity_id: str,
    risks: list[TransactionRisk],
) -> TransactionGraph:
    del result
    selected = risks[0].transaction_id if risks else None
    compact = sorted(risks, key=lambda risk: (-risk.is_flagged, -risk.risk_score, risk.timestamp))[:80]
    graph = _build_graph(compact, selected_transaction_id=selected)
    entity_node_id = _node_id(entity_type, entity_id)
    if entity_node_id not in {node.id for node in graph.nodes}:
        graph.nodes.append(
            GraphNode(
                id=entity_node_id,
                type=_normalize_entity_type(entity_type),
                label=_entity_label(entity_type, entity_id),
                highlighted=True,
            )
        )
    return graph


def _build_graph(risks: list[TransactionRisk], selected_transaction_id: str | None) -> TransactionGraph:
    nodes: dict[str, GraphNode] = {}
    edges: dict[tuple[str, str, str], GraphEdge] = {}
    entity_counts: dict[str, int] = defaultdict(int)
    for risk in risks:
        for entity_type, entity_id in _entity_pairs(risk):
            entity_counts[_node_id(entity_type, entity_id)] += 1

    for risk in risks:
        tx_node_id = _node_id("transaction", risk.transaction_id)
        selected = risk.transaction_id == selected_transaction_id
        nodes[tx_node_id] = GraphNode(
            id=tx_node_id,
            type="transaction",
            label=risk.transaction_id,
            selected=selected,
            highlighted=selected or risk.is_flagged,
            risk_score=risk.risk_score,
            risk_level=risk.risk_level,
            is_flagged=risk.is_flagged,
        )
        for entity_type, entity_id in _entity_pairs(risk):
            entity_node_id = _node_id(entity_type, entity_id)
            nodes.setdefault(
                entity_node_id,
                GraphNode(
                    id=entity_node_id,
                    type=_normalize_entity_type(entity_type),
                    label=_entity_label(entity_type, entity_id),
                    highlighted=entity_counts[entity_node_id] > 1,
                ),
            )
            edge_key = (tx_node_id, entity_node_id, entity_type)
            edges[edge_key] = GraphEdge(
                source=tx_node_id,
                target=entity_node_id,
                relation=entity_type,
                highlighted=selected or entity_counts[entity_node_id] > 1,
            )
    return TransactionGraph(nodes=list(nodes.values()), edges=list(edges.values()))


def _entity_pairs(risk: TransactionRisk) -> list[tuple[str, str]]:
    pairs = [
        ("card", risk.card_id),
        ("merchant", risk.merchant_name),
        ("category_country_cluster", _cluster_id(risk)),
    ]
    if risk.device_id:
        pairs.append(("device", risk.device_id))
    if risk.ip_address:
        pairs.append(("ip", risk.ip_address))
    return pairs


def _node_id(entity_type: str, entity_id: str) -> str:
    return f"{entity_type}:{entity_id}"


def _entity_value(risk: TransactionRisk, entity_type: str) -> str:
    if entity_type == "transaction":
        return risk.transaction_id
    if entity_type == "card":
        return risk.card_id
    if entity_type == "merchant":
        return risk.merchant_name
    if entity_type == "device":
        return risk.device_id or ""
    if entity_type == "ip":
        return risk.ip_address or ""
    if entity_type == "category_country_cluster":
        return _cluster_id(risk)
    raise KeyError(f"unsupported entity type: {entity_type}")


def _entity_label(entity_type: str, entity_id: str) -> str:
    normalized_type = _normalize_entity_type(entity_type)
    if normalized_type == "category_country_cluster":
        return entity_id.replace("|", " / ")
    return entity_id


def _cluster_id(risk: TransactionRisk) -> str:
    return f"{risk.merchant_category}|{risk.merchant_country}"


def _normalize_entity_type(entity_type: str) -> EntityType:
    normalized = entity_type.strip().lower().replace("-", "_")
    if normalized == "category" or normalized == "cluster":
        normalized = "category_country_cluster"
    if normalized not in ENTITY_TYPES:
        raise KeyError(f"unsupported entity type: {entity_type}")
    return normalized  # type: ignore[return-value]
