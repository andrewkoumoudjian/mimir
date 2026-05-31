"""CSV export with fraud/risk columns appended."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from mimir.core.schemas import TransactionRisk


def export_flagged_csv(
    source_frame: pl.DataFrame,
    risks: list[TransactionRisk],
    output_path: str | Path,
) -> Path:
    """Export all original rows with reviewer-oriented risk columns."""

    risk_rows = [
        {
            "transaction_id": risk.transaction_id,
            "mimir_risk_score": risk.risk_score,
            "mimir_risk_level": risk.risk_level,
            "mimir_is_flagged": risk.is_flagged,
            "mimir_xfraud_graph_score": risk.xfraud_graph_score,
            "mimir_recommended_action": risk.recommended_action,
            "mimir_primary_pattern": risk.primary_pattern,
            "mimir_reason_codes": ";".join(reason.code for reason in risk.reasons),
            "mimir_review_status": risk.review.status,
        }
        for risk in risks
    ]
    output = source_frame.drop("_timestamp_dt", strict=False).join(
        pl.DataFrame(risk_rows),
        on="transaction_id",
        how="left",
    )
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    output.write_csv(path)
    return path
