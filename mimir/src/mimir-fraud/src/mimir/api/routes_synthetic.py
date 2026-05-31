"""Synthetic live-feed routes backed by the Rust synthetic pipeline."""

from __future__ import annotations

import csv
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from mimir.core.constants import REQUIRED_TRANSACTION_COLUMNS
from mimir.engine import run_fraud_engine
from mimir.primitives.rust_backed import RustPrimitiveUnavailable

SYNTHETIC_SEED = 0x4D49_4D49_52
SYNTHETIC_PREFIX = "live_syn"
MAX_BATCH_COUNT = 12
MAX_CURSOR = 5_000


def get_synthetic_live_feed(
    input_path: str | Path,
    output_dir: str | Path,
    profile: str,
    cursor: int = 0,
    count: int = 3,
    false_positive_cost: float | None = None,
    false_negative_cost: float | None = None,
) -> dict[str, Any]:
    """Generate and score a deterministic synthetic live-feed window."""

    safe_cursor = max(0, min(int(cursor), MAX_CURSOR))
    safe_count = max(1, min(int(count), MAX_BATCH_COUNT))
    generated_total = safe_cursor + safe_count

    TransactionProfile = _import_transaction_profile()
    source_path = Path(input_path)
    transaction_profile = TransactionProfile.from_csv(str(source_path))
    generated_rows = transaction_profile.generate(
        generated_total,
        random_seed=SYNTHETIC_SEED,
        prefix=SYNTHETIC_PREFIX,
    )
    selected_rows = generated_rows[safe_cursor:generated_total]
    selected_ids = [str(row["transaction_id"]) for row in selected_rows]
    analysis_path = _write_analysis_window(source_path, generated_rows)

    try:
        result = run_fraud_engine(
            input_path=analysis_path,
            output_dir=Path(output_dir) / "synthetic_live",
            profile=profile,
            false_positive_cost=false_positive_cost,
            false_negative_cost=false_negative_cost,
            write_outputs=False,
        )
    finally:
        analysis_path.unlink(missing_ok=True)

    risks_by_id = {risk.transaction_id: risk for risk in result.risks}
    received_at = datetime.now(UTC).isoformat()
    events: list[dict[str, Any]] = []
    for index, transaction_id in enumerate(selected_ids):
        risk = risks_by_id.get(transaction_id)
        if risk is None:
            continue
        payload = risk.model_dump(mode="json")
        payload.update(
            {
                "arrival_index": safe_cursor + index,
                "received_at": received_at,
                "source": "synthetic_pipeline.TransactionProfile.generate",
                "raw_transaction": selected_rows[index],
            }
        )
        events.append(payload)

    return {
        "source": "synthetic_pipeline.TransactionProfile",
        "cursor": safe_cursor,
        "next_cursor": safe_cursor + len(events),
        "requested_count": safe_count,
        "count": len(events),
        "generated_total": generated_total,
        "profile": transaction_profile.summary(),
        "diagnostics": {
            "processed_rows": result.summary.processed_rows,
            "flagged_rows": result.summary.flagged_rows,
            "threshold": result.summary.threshold,
            "model_version": result.summary.model_version,
        },
        "events": events,
    }


def _import_transaction_profile():
    try:
        from synthetic_pipeline import TransactionProfile
    except ImportError as exc:
        raise RustPrimitiveUnavailable(
            "synthetic-pipeline is required for the live synthetic feed. "
            "Install it with `python3.12 -m pip install -e mimir/packages/synthetic-pipeline`."
        ) from exc
    return TransactionProfile


def _write_analysis_window(source_path: Path, generated_rows: list[dict[str, Any]]) -> Path:
    temp = tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".csv",
        prefix="mimir-live-synthetic-",
        newline="",
        delete=False,
    )
    temp_path = Path(temp.name)
    with temp:
        writer = csv.DictWriter(temp, fieldnames=list(REQUIRED_TRANSACTION_COLUMNS))
        writer.writeheader()
        with source_path.open(newline="") as source_file:
            reader = csv.DictReader(source_file)
            for row in reader:
                writer.writerow(
                    {column: row.get(column, "") for column in REQUIRED_TRANSACTION_COLUMNS}
                )
        for row in generated_rows:
            writer.writerow(
                {column: row.get(column, "") for column in REQUIRED_TRANSACTION_COLUMNS}
            )
    return temp_path
