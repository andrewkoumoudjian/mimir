from __future__ import annotations

from pathlib import Path

import pytest

from mimir.engine import run_fraud_engine
from mimir.context import build_transaction_context
from mimir.review.audit_log import read_audit_events
from mimir.review.review_state import ReviewState
from mimir.review.training_status import build_training_status


ROOT = Path(__file__).resolve().parents[4]
TRANSACTIONS = ROOT / "valsoft" / "data" / "transactions.csv"


@pytest.fixture(scope="module")
def engine_result(tmp_path_factory):
    return run_fraud_engine(
        input_path=TRANSACTIONS,
        output_dir=tmp_path_factory.mktemp("mimir-output"),
        profile="balanced",
        write_outputs=False,
    )


def test_known_high_risk_gift_card_is_flagged_with_reason(engine_result):
    risk = next(item for item in engine_result.risks if item.transaction_id == "tx_000985")

    assert risk.is_flagged is True
    assert risk.primary_pattern == "account_takeover_purchase"
    assert risk.risk_score >= 0.80
    assert any(reason.code == "HIGH_RISK_CATEGORY_AMOUNT" for reason in risk.reasons)


def test_known_low_risk_restaurant_transaction_is_not_flagged(engine_result):
    risk = next(item for item in engine_result.risks if item.transaction_id == "tx_000081")

    assert risk.is_flagged is False
    assert risk.risk_score < engine_result.summary.threshold


def test_xfraud_score_and_transaction_context_are_available(engine_result):
    risk = next(item for item in engine_result.risks if item.transaction_id == "tx_000985")
    context = build_transaction_context(engine_result, "tx_000985")

    assert 0.0 <= risk.xfraud_graph_score <= 1.0
    assert engine_result.summary.primitive_status["xfraud_training"]["available"] is True
    assert engine_result.summary.primitive_status["xfraud_training"]["current_model_version"]
    assert "model_metrics" in engine_result.summary.primitive_status["xfraud_training"]
    assert [link["target_type"] for link in context["links"]] == [
        "card",
        "merchant",
        "category_country_cluster",
        "device",
        "ip",
    ]
    assert context["card_timeline"]
    assert context["graph"]["nodes"]


def test_review_state_supports_action_and_undo(tmp_path):
    state = ReviewState()
    state_path = tmp_path / "review_state.json"
    audit_path = tmp_path / "audit_log.jsonl"

    event = state.action(
        "tx_000985",
        "decline",
        reviewer="tester",
        reviewer_confidence=0.85,
        note="fraud pattern accepted",
        feature_snapshot={"merchant_category": "gift_card"},
        original_score=0.91,
        model_version="test-model-v1",
        audit_log_path=audit_path,
    )
    state.save(state_path)
    reloaded = ReviewState.load(state_path)
    audit_events = read_audit_events(audit_path)

    assert event.to_status == "declined"
    assert event.training_label == "positive"
    assert event.reviewer_confidence == 0.85
    assert event.feature_snapshot == {"merchant_category": "gift_card"}
    assert event.original_score == 0.91
    assert event.model_version == "test-model-v1"
    assert reloaded.reviews["tx_000985"].status == "declined"
    assert audit_events[0].training_label == "positive"

    status = build_training_status(reloaded, audit_events, xfraud_available=True, current_model_version="test-model-v1")
    assert status["learning_state"] == "active"
    assert status["reviewer_feedback"]["decision_count"] == 1
    assert status["reviewer_feedback"]["label_counts"]["positive"] == 1

    undo_event = reloaded.undo(audit_log_path=audit_path)
    assert undo_event is not None
    assert reloaded.reviews["tx_000985"].status == "pending"
    assert audit_path.exists()
