"""Load Valsoft transactions into a normalized Polars frame."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from mimir.core.constants import REQUIRED_TRANSACTION_COLUMNS
from mimir.data.validate_transactions import validate_transactions


def load_transactions(path: str | Path) -> pl.DataFrame:
    """Read and normalize a transaction CSV."""

    df = pl.read_csv(
        path,
        infer_schema_length=2000,
        null_values=["", "null", "None"],
        schema_overrides={"transaction_id": pl.String, "amount": pl.Float64},
    )

    for column in REQUIRED_TRANSACTION_COLUMNS:
        if column not in df.columns:
            continue
        if column == "amount":
            df = df.with_columns(pl.col(column).cast(pl.Float64))
        else:
            df = df.with_columns(pl.col(column).cast(pl.String))

    validate_transactions(df)

    return (
        df.with_columns(
            pl.col("device_id").fill_null(""),
            pl.col("ip_address").fill_null(""),
            pl.col("timestamp").str.to_datetime(strict=True).alias("_timestamp_dt"),
            pl.col("amount").round(2),
        )
        .select([*REQUIRED_TRANSACTION_COLUMNS, "_timestamp_dt"])
        .sort("_timestamp_dt")
    )
