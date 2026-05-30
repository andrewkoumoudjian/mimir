"""Input validation for transaction CSVs."""

from __future__ import annotations

from datetime import datetime

import polars as pl

from mimir.core.constants import REQUIRED_TRANSACTION_COLUMNS


class TransactionValidationError(ValueError):
    """Raised when a transaction file cannot be processed safely."""


def validate_transactions(df: pl.DataFrame) -> None:
    """Validate the minimum Valsoft transaction contract."""

    missing = [column for column in REQUIRED_TRANSACTION_COLUMNS if column not in df.columns]
    if missing:
        raise TransactionValidationError(f"Missing required columns: {', '.join(missing)}")

    if df.height == 0:
        raise TransactionValidationError("Transaction file is empty")

    duplicate_ids = (
        df.group_by("transaction_id")
        .len()
        .filter(pl.col("len") > 1)
        .select("transaction_id")
        .to_series()
        .to_list()
    )
    if duplicate_ids:
        sample = ", ".join(str(value) for value in duplicate_ids[:5])
        raise TransactionValidationError(f"Duplicate transaction_id values: {sample}")

    bad_amounts = df.filter(pl.col("amount").is_null() | (pl.col("amount") < 0))
    if bad_amounts.height:
        raise TransactionValidationError("All transactions must have non-negative numeric amounts")

    bad_timestamps: list[str] = []
    for value in df.select("timestamp").to_series().to_list():
        try:
            datetime.fromisoformat(str(value))
        except ValueError:
            bad_timestamps.append(str(value))

    if bad_timestamps:
        sample = ", ".join(bad_timestamps[:5])
        raise TransactionValidationError(f"Invalid ISO timestamp values: {sample}")
