"""Optional model-consensus anomaly score."""

from __future__ import annotations

import polars as pl

from mimir.scoring.normalize import percentile_rank


NUMERIC_FEATURES = (
    "amount",
    "amount_ratio_to_card_median",
    "robust_z_log_amount",
    "merchant_category_card_surprisal",
    "merchant_name_card_surprisal",
    "category_channel_country_combo_surprisal",
    "card_tx_count_10m",
    "card_tx_count_60m",
    "card_small_tx_count_60m",
    "merchant_unique_cards_60m",
    "merchant_burst_score",
    "merchant_unique_cards_24h",
    "ip_prefix_unique_cards_60m",
    "card_high_risk_tx_count_24h",
    "card_high_amount_tx_count_24h",
    "same_card_same_device_count_24h",
)


def add_model_consensus_score(df: pl.DataFrame) -> pl.DataFrame:
    """Run an optional IsolationForest and return a percentile anomaly score."""

    try:
        import numpy as np
        from sklearn.ensemble import IsolationForest
        from sklearn.preprocessing import RobustScaler
    except Exception:
        return df.with_columns(pl.lit(0.0).alias("model_consensus_score"))

    feature_names = [name for name in NUMERIC_FEATURES if name in df.columns]
    if not feature_names or df.height < 20:
        return df.with_columns(pl.lit(0.0).alias("model_consensus_score"))

    matrix = df.select(feature_names).fill_null(0.0).to_numpy()
    matrix = np.nan_to_num(matrix, nan=0.0, posinf=0.0, neginf=0.0)
    scaled = RobustScaler().fit_transform(matrix)
    model = IsolationForest(n_estimators=160, contamination=0.08, random_state=42)
    model.fit(scaled)
    anomaly_strength = -model.score_samples(scaled)
    percentiles = percentile_rank(anomaly_strength.tolist())
    return df.with_columns(pl.Series("model_consensus_score", [round(value, 4) for value in percentiles]))
