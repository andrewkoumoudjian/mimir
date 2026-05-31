"""CSV exports with fraud/risk columns appended."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from mimir.core.schemas import TransactionRisk


def _reason_codes(risk: TransactionRisk) -> str:
    return ";".join(reason.code for reason in risk.reasons)


def export_flagged_csv(
    source_frame: pl.DataFrame,
    risks: list[TransactionRisk],
    output_path: str | Path,
) -> Path:
    """Export all original rows with reviewer-oriented risk columns."""

    risk_rows = [
        {
            "transaction_id": risk.transaction_id,
            "identified_fraud": risk.is_flagged,
            "fraud_pattern": risk.primary_pattern if risk.is_flagged else "",
            "fraud_reason_codes": _reason_codes(risk) if risk.is_flagged else "",
            "mimir_risk_score": risk.risk_score,
            "mimir_risk_level": risk.risk_level,
            "mimir_is_flagged": risk.is_flagged,
            "mimir_xfraud_graph_score": risk.xfraud_graph_score,
            "mimir_recommended_action": risk.recommended_action,
            "mimir_primary_pattern": risk.primary_pattern,
            "mimir_reason_codes": _reason_codes(risk),
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


def export_identified_fraud_csv(
    source_frame: pl.DataFrame,
    risks: list[TransactionRisk],
    output_path: str | Path,
) -> Path:
    """Export the flagged transaction ID list with the explaining fraud pattern."""

    risk_rows = [
        {
            "transaction_id": risk.transaction_id,
            "identified_fraud": True,
            "fraud_pattern": risk.primary_pattern,
            "risk_score": risk.risk_score,
            "risk_level": risk.risk_level,
            "recommended_action": risk.recommended_action,
            "xfraud_graph_score": risk.xfraud_graph_score,
            "reason_codes": _reason_codes(risk),
            "review_status": risk.review.status,
        }
        for risk in risks
        if risk.is_flagged
    ]
    risk_frame = pl.DataFrame(
        risk_rows,
        schema={
            "transaction_id": pl.Utf8,
            "identified_fraud": pl.Boolean,
            "fraud_pattern": pl.Utf8,
            "risk_score": pl.Float64,
            "risk_level": pl.Utf8,
            "recommended_action": pl.Utf8,
            "xfraud_graph_score": pl.Float64,
            "reason_codes": pl.Utf8,
            "review_status": pl.Utf8,
        },
    )
    output = (
        source_frame.drop("_timestamp_dt", strict=False)
        .join(risk_frame, on="transaction_id", how="inner")
        .sort("risk_score", descending=True)
    )
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    output.write_csv(path)
    return path
