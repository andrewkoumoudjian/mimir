"""Explainable graph and cross-card collective anomaly features."""

from __future__ import annotations

import polars as pl

from mimir.primitives import build_collective_feature_frame


def add_graph_collective_features(df: pl.DataFrame) -> pl.DataFrame:
    """Add graph-derived features from the Rust streaming primitive."""

    feature_frame = build_collective_feature_frame(df)
    return df.join(feature_frame, on="transaction_id", how="left")
