"""End-to-end Valsoft fraud engine orchestration."""

from __future__ import annotations

from pathlib import Path

from mimir.core.paths import DEFAULT_OUTPUT_DIR, DEFAULT_TRANSACTION_CSV, ensure_output_dir
from mimir.core.schemas import EngineSummary
from mimir.data.load_transactions import load_transactions
from mimir.export.export_csv import export_flagged_csv
from mimir.export.export_json import export_review_queue_json, export_risk_json
from mimir.features.feature_pipeline import build_feature_frame
from mimir.review.feedback import apply_feedback_suppression
from mimir.review.review_state import ReviewState
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
    features = build_feature_frame(transactions)
    result = score_feature_frame(
        features,
        profile=profile,
        review_rate=review_rate,
        false_positive_cost=false_positive_cost,
        false_negative_cost=false_negative_cost,
        review_status_by_transaction=review_state.reviews,
    )
    risks = apply_feedback_suppression(result.risks, review_state)
    result = EngineResult(feature_frame=result.feature_frame, risks=risks, summary=result.summary)

    if write_outputs:
        output_files = write_engine_outputs(transactions, result, output_path)
        result.summary.output_files.update({key: str(value) for key, value in output_files.items()})

    return result


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
