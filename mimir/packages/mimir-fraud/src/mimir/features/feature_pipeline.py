"""Composable feature pipeline for Valsoft-first fraud scoring."""

from __future__ import annotations

import polars as pl

from mimir.features.card_baselines import add_card_baseline_features
from mimir.features.categorical_surprisal import add_categorical_surprisal_features
from mimir.features.graph_collective import add_graph_collective_features
from mimir.features.model_consensus import add_model_consensus_score
from mimir.features.temporal_velocity import add_temporal_velocity_features


def build_feature_frame(transactions: pl.DataFrame) -> pl.DataFrame:
    """Return transactions with all deterministic fraud features attached."""

    df = transactions.with_row_index("_engine_row")
    df = add_card_baseline_features(df)
    df = add_categorical_surprisal_features(df)
    df = add_temporal_velocity_features(df)
    df = add_graph_collective_features(df)
    df = add_model_consensus_score(df)
    return df.sort("_engine_row")
