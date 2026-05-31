"""End-to-end Valsoft fraud engine orchestration."""

from __future__ import annotations

from pathlib import Path

from mimir.core.paths import DEFAULT_OUTPUT_DIR, DEFAULT_TRANSACTION_CSV, ensure_output_dir
from mimir.core.schemas import EngineSummary
from mimir.data.load_transactions import load_transactions
from mimir.export.export_csv import export_flagged_csv
from mimir.export.export_json import export_review_queue_json, export_risk_json
from mimir.features.feature_pipeline import build_feature_frame
from mimir.primitives import primitive_runtime_status, xfraud_graph_probe
from mimir.review.feedback import apply_session_feedback_adjustments
from mimir.review.review_state import ReviewState
from mimir.review.training_status import build_training_status
from mimir.scoring.score_engine import EngineResult, score_feature_frame


def run_fraud_engine(
    input_path: str | Path = DEFAULT_TRANSACTION_CSV,
    output_dir: str | Path = DEFAULT_OUTPUT_DIR,
    profile: str = "balanced",
    review_rate: float | None = None,
    false_positive_cost: float | None = None,
    false_negative_cost: float | None = None,
    state_path: str | Path | None = None,
    write_outputs: bool = True,
) -> EngineResult:
    """Run ingestion, feature engineering, scoring, and optional exports."""

    output_path = ensure_output_dir(output_dir)
    state_file = Path(state_path) if state_path else output_path / "review_state.json"
    review_state = ReviewState.load(state_file)

    transactions = load_transactions(input_path)
    feature_result = build_feature_frame(transactions, review_status_by_transaction=review_state.reviews)
    features = feature_result.frame
    result = score_feature_frame(
        features,
        profile=profile,
        review_rate=review_rate,
        false_positive_cost=false_positive_cost,
        false_negative_cost=false_negative_cost,
        review_status_by_transaction=review_state.reviews,
    )
    risks = apply_session_feedback_adjustments(result.risks, review_state, result.summary.threshold)
    result = EngineResult(feature_frame=result.feature_frame, risks=risks, summary=result.summary)
    _refresh_summary_counts(result.summary, risks)
    primitive_status = primitive_runtime_status(str(input_path))
    try:
        primitive_status["xfraud_training"]["probe"] = xfraud_graph_probe(result.feature_frame)
    except Exception as exc:
        primitive_status["xfraud_training"]["probe_error"] = str(exc)
    primitive_status["xfraud_training"].update(feature_result.diagnostics.get("xfraud_training", {}))
    primitive_status["xfraud_training"].update(
        build_training_status(
            review_state,
            xfraud_available=bool(primitive_status["xfraud_training"].get("available")),
            current_model_version=result.summary.model_version,
        )
    )
    result.summary.primitive_status = primitive_status

    if write_outputs:
        output_files = write_engine_outputs(transactions, result, output_path)
        result.summary.output_files.update({key: str(value) for key, value in output_files.items()})

    return result


def _refresh_summary_counts(summary: EngineSummary, risks) -> None:
    summary.flagged_rows = sum(1 for risk in risks if risk.is_flagged)
    risk_level_counts: dict[str, int] = {}
    primary_pattern_counts: dict[str, int] = {}
    for risk in risks:
        risk_level_counts[risk.risk_level] = risk_level_counts.get(risk.risk_level, 0) + 1
        if risk.is_flagged:
            primary_pattern_counts[risk.primary_pattern] = primary_pattern_counts.get(risk.primary_pattern, 0) + 1
    summary.risk_level_counts = risk_level_counts
    summary.primary_pattern_counts = primary_pattern_counts


def write_engine_outputs(
    transactions,
    result: EngineResult,
    output_dir: str | Path,
) -> dict[str, Path]:
    """Write CSV and JSON artifacts required by the challenge."""

    output_path = ensure_output_dir(output_dir)
    files = {
        "updated_csv": export_flagged_csv(
            transactions,
            result.risks,
            output_path / "transactions_with_mimir_risk.csv",
        ),
        "review_queue_json": export_review_queue_json(
            result.risks,
            output_path / "review_queue.json",
        ),
    }
    risk_json_path = output_path / "risk_results.json"
    result.summary.output_files.update(
        {
            "updated_csv": str(files["updated_csv"]),
            "review_queue_json": str(files["review_queue_json"]),
            "risk_json": str(risk_json_path),
        }
    )
    files["risk_json"] = export_risk_json(result.risks, result.summary, risk_json_path)
    return files


def summarize_result(result: EngineResult) -> EngineSummary:
    """Return a detached summary object."""

    return result.summary.model_copy(deep=True)
