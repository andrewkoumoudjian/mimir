"""Typed JSON contracts used by the engine, CLI, and API."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


RiskLevel = Literal["low", "medium", "high", "critical"]
ReviewStatus = Literal["pending", "approved", "dismissed", "escalated"]
Severity = Literal["low", "medium", "high", "critical"]
ReviewerAction = Literal["approve", "dismiss", "escalate"]


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
    reviewer: str = "local_reviewer"
    note: str | None = None
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
    risk_score: float
    risk_level: RiskLevel
    is_flagged: bool
    recommended_action: Literal["monitor", "review", "escalate"]
    primary_pattern: str
    component_scores: ComponentScores
    reasons: list[Reason]
    review: TransactionReview = Field(default_factory=TransactionReview)


class ReviewerDecision(BaseModel):
    """Input contract for reviewer actions from API or CLI."""

    transaction_id: str
    action: ReviewerAction
    reviewer: str = "local_reviewer"
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
    risk_level_counts: dict[str, int]
    primary_pattern_counts: dict[str, int]
    output_files: dict[str, str] = Field(default_factory=dict)
