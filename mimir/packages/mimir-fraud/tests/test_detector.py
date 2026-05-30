from __future__ import annotations

from pathlib import Path

import pytest

from mimir.engine import run_fraud_engine
from mimir.review.review_state import ReviewState


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


def test_review_state_supports_action_and_undo(tmp_path):
    state = ReviewState()
    state_path = tmp_path / "review_state.json"
    audit_path = tmp_path / "audit_log.jsonl"

    event = state.action("tx_000985", "escalate", reviewer="tester", audit_log_path=audit_path)
    state.save(state_path)
    reloaded = ReviewState.load(state_path)

    assert event.to_status == "escalated"
    assert reloaded.reviews["tx_000985"].status == "escalated"

    undo_event = reloaded.undo(audit_log_path=audit_path)
    assert undo_event is not None
    assert reloaded.reviews["tx_000985"].status == "pending"
    assert audit_path.exists()
