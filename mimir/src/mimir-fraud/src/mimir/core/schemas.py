"""Typed JSON contracts used by the engine, CLI, and API."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from mimir.core.constants import CURRENT_MODEL_VERSION


RiskLevel = Literal["low", "medium", "high", "critical"]
ReviewStatus = Literal["pending", "approved", "dismissed", "escalated", "declined", "blocked"]
Severity = Literal["low", "medium", "high", "critical"]
ReviewerAction = Literal["approve", "dismiss", "escalate", "decline", "block"]
TrainingLabel = Literal["negative", "positive", "weak_positive", "unresolved"]
EntityType = Literal["transaction", "card", "merchant", "device", "ip", "category_country_cluster"]


class Reason(BaseModel):
    """Human-readable reason backed by exact evidence."""

    code: str
    severity: Severity
    message: str
    evidence: dict[str, Any] = Field(default_factory=dict)
    priority: int = 50


class ComponentScores(BaseModel):
    """Normalized component scores in the required weighting shape."""

    card_baseline: float = 0.0
    categorical_surprisal: float = 0.0
    temporal_velocity: float = 0.0
    graph_collective: float = 0.0
    model_consensus: float = 0.0


class ReviewHistoryEvent(BaseModel):
    """One review decision or undoable state transition."""

    transaction_id: str
    action: str
    from_status: ReviewStatus
    to_status: ReviewStatus
    reviewer: str = "agent_reviewer"
    reviewer_confidence: float | None = None
    note: str | None = None
    training_label: TrainingLabel | None = None
    feature_snapshot: dict[str, Any] = Field(default_factory=dict)
    original_score: float | None = None
    original_reasons: list[Reason] = Field(default_factory=list)
    model_version: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TransactionReview(BaseModel):
    """Review state embedded in each transaction risk object."""

    status: ReviewStatus = "pending"
    history: list[ReviewHistoryEvent] = Field(default_factory=list)


class TransactionRisk(BaseModel):
    """Directly renderable risk record for a transaction."""

    model_config = ConfigDict(extra="allow")

    transaction_id: str
    timestamp: str
    card_id: str
    amount: float
    merchant_name: str
    merchant_category: str
    channel: str
    cardholder_country: str
    merchant_country: str
    device_id: str | None = None
    ip_address: str | None = None
    xfraud_graph_score: float = 0.0
    risk_score: float
    risk_level: RiskLevel
    is_flagged: bool
    recommended_action: Literal["monitor", "review", "escalate"]
    primary_pattern: str
    component_scores: ComponentScores
    reasons: list[Reason]
    model_version: str = CURRENT_MODEL_VERSION
    review: TransactionReview = Field(default_factory=TransactionReview)


class ReviewerDecision(BaseModel):
    """Input contract for reviewer actions from API or CLI."""

    transaction_id: str
    action: ReviewerAction
    reviewer: str = "agent_reviewer"
    reviewer_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    note: str | None = None

    @field_validator("transaction_id")
    @classmethod
    def transaction_id_required(cls, value: str) -> str:
        if not value:
            raise ValueError("transaction_id is required")
        return value


class EngineSummary(BaseModel):
    """High-level run summary for demos and API clients."""

    processed_rows: int
    flagged_rows: int
    review_rate: float
    threshold: float
    profile: str
    model_version: str = CURRENT_MODEL_VERSION
    risk_level_counts: dict[str, int]
    primary_pattern_counts: dict[str, int]
    primitive_status: dict[str, Any] = Field(default_factory=dict)
    output_files: dict[str, str] = Field(default_factory=dict)


class EntityLink(BaseModel):
    """A typed link between a transaction and one entity."""

    source_type: EntityType
    source_id: str
    target_type: EntityType
    target_id: str
    relation: str
    label: str


class TimelineItem(BaseModel):
    """Compact transaction row for timelines and related lists."""

    transaction_id: str
    timestamp: str
    amount: float
    merchant_name: str
    merchant_category: str
    risk_score: float
    risk_level: RiskLevel
    is_flagged: bool
    review_status: ReviewStatus
    primary_pattern: str


class GraphNode(BaseModel):
    """Node used by the reviewer graph view."""

    id: str
    type: EntityType
    label: str
    selected: bool = False
    highlighted: bool = False
    risk_score: float | None = None
    risk_level: RiskLevel | None = None
    is_flagged: bool | None = None


class GraphEdge(BaseModel):
    """Edge used by the reviewer graph view."""

    source: str
    target: str
    relation: str
    highlighted: bool = False


class TransactionGraph(BaseModel):
    """Renderable entity graph contract."""

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class TransactionContext(BaseModel):
    """Context around one transaction and its linked entities."""

    transaction: dict[str, Any]
    links: list[EntityLink]
    card_timeline: list[TimelineItem]
    related_transactions: dict[str, list[TimelineItem]]
    graph: TransactionGraph


class EntityContext(BaseModel):
    """Context around one non-transaction entity."""

    entity_type: EntityType
    entity_id: str
    label: str
    links: list[EntityLink]
    transactions: list[TimelineItem]
    graph: TransactionGraph
