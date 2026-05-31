"""Composable feature pipeline for Valsoft-first fraud scoring."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import polars as pl

from mimir.core.schemas import TransactionReview
from mimir.features.card_baselines import add_card_baseline_features
from mimir.features.categorical_surprisal import add_categorical_surprisal_features
from mimir.features.graph_collective import add_graph_collective_features
from mimir.features.model_consensus import add_model_consensus_score
from mimir.features.temporal_velocity import add_temporal_velocity_features
from mimir.features.xfraud_graph import add_xfraud_graph_score


@dataclass(frozen=True)
class FeaturePipelineResult:
    """Feature frame with model-side diagnostic reports."""

    frame: pl.DataFrame
    diagnostics: dict[str, Any]


def build_feature_frame(
    transactions: pl.DataFrame,
    review_status_by_transaction: dict[str, TransactionReview] | None = None,
) -> FeaturePipelineResult:
    """Return transactions with all deterministic fraud features attached."""

    df = transactions.with_row_index("_engine_row")
    df = add_card_baseline_features(df)
    df = add_categorical_surprisal_features(df)
    df = add_temporal_velocity_features(df)
    df = add_graph_collective_features(df)
    df = add_model_consensus_score(df)
    xfraud_result = add_xfraud_graph_score(df, review_status_by_transaction)
    return FeaturePipelineResult(
        frame=xfraud_result.frame.sort("_engine_row"),
        diagnostics={"xfraud_training": xfraud_result.report},
    )
