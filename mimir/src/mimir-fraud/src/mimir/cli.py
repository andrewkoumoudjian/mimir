"""Command line interface for the Valsoft fraud engine."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from mimir.api.main import run_server
from mimir.context import build_transaction_context
from mimir.core.paths import DEFAULT_OUTPUT_DIR, DEFAULT_TRANSACTION_CSV, ensure_output_dir
from mimir.engine import run_fraud_engine
from mimir.review.review_state import ReviewState


def _add_common_score_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--input", default=str(DEFAULT_TRANSACTION_CSV), help="Path to transactions.csv")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory for output artifacts")
    parser.add_argument(
        "--profile",
        default="balanced",
        choices=["conservative", "balanced", "aggressive"],
        help="Reviewer queue size preset",
    )
    parser.add_argument("--review-rate", type=float, default=None, help="Custom top-N review rate, e.g. 0.10")
    parser.add_argument("--false-positive-cost", type=float, default=None)
    parser.add_argument("--false-negative-cost", type=float, default=None)


def score_command(args: argparse.Namespace) -> int:
    result = run_fraud_engine(
        input_path=args.input,
        output_dir=args.output_dir,
        profile=args.profile,
        review_rate=args.review_rate,
        false_positive_cost=args.false_positive_cost,
        false_negative_cost=args.false_negative_cost,
        write_outputs=True,
    )
    print(json.dumps(result.summary.model_dump(mode="json"), indent=2))
    return 0


def queue_command(args: argparse.Namespace) -> int:
    result = run_fraud_engine(
        input_path=args.input,
        output_dir=args.output_dir,
        profile=args.profile,
        review_rate=args.review_rate,
        false_positive_cost=args.false_positive_cost,
        false_negative_cost=args.false_negative_cost,
        write_outputs=False,
    )
    risks = [risk for risk in result.risks if risk.is_flagged]
    if args.status:
        risks = [risk for risk in risks if risk.review.status == args.status]
    rows = [
        {
            "rank": index + 1,
            "transaction_id": risk.transaction_id,
            "score": risk.risk_score,
            "level": risk.risk_level,
            "pattern": risk.primary_pattern,
            "amount": risk.amount,
            "merchant": risk.merchant_name,
            "reason": risk.reasons[0].message if risk.reasons else "",
        }
        for index, risk in enumerate(risks)
    ]
    print(json.dumps(rows, indent=2))
    return 0


def next_command(args: argparse.Namespace) -> int:
    result = run_fraud_engine(
        input_path=args.input,
        output_dir=args.output_dir,
        profile=args.profile,
        review_rate=args.review_rate,
        false_positive_cost=args.false_positive_cost,
        false_negative_cost=args.false_negative_cost,
        write_outputs=False,
    )
    candidate = next(
        (risk for risk in result.risks if risk.is_flagged and risk.review.status == args.status),
        None,
    )
    payload = {"ok": candidate is not None, "transaction": candidate.model_dump(mode="json") if candidate else None}
    print(json.dumps(payload, indent=2))
    return 0


def context_command(args: argparse.Namespace) -> int:
    result = run_fraud_engine(
        input_path=args.input,
        output_dir=args.output_dir,
        profile=args.profile,
        review_rate=args.review_rate,
        false_positive_cost=args.false_positive_cost,
        false_negative_cost=args.false_negative_cost,
        write_outputs=False,
    )
    print(json.dumps(build_transaction_context(result, args.transaction_id), indent=2))
    return 0


def review_command(args: argparse.Namespace) -> int:
    output_dir = ensure_output_dir(args.output_dir)
    state_path = output_dir / "review_state.json"
    audit_log_path = output_dir / "audit_log.jsonl"
    state = ReviewState.load(state_path)
    event = state.action(
        args.transaction_id,
        args.action,
        reviewer=args.reviewer,
        reviewer_confidence=args.reviewer_confidence,
        note=args.note,
        audit_log_path=audit_log_path,
    )
    state.save(state_path)
    print(event.model_dump_json(indent=2))
    return 0


def undo_command(args: argparse.Namespace) -> int:
    output_dir = ensure_output_dir(args.output_dir)
    state_path = output_dir / "review_state.json"
    audit_log_path = output_dir / "audit_log.jsonl"
    state = ReviewState.load(state_path)
    event = state.undo(audit_log_path=audit_log_path)
    state.save(state_path)
    print(json.dumps({"ok": event is not None, "event": event.model_dump(mode="json") if event else None}, indent=2))
    return 0


def serve_command(args: argparse.Namespace) -> int:
    run_server(
        host=args.host,
        port=args.port,
        input_path=args.input,
        output_dir=args.output_dir,
        profile=args.profile,
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mimir", description="Mimir Valsoft fraud/risk engine")
    subparsers = parser.add_subparsers(dest="command", required=True)

    score_parser = subparsers.add_parser("score", help="Score transactions and write CSV/JSON artifacts")
    _add_common_score_args(score_parser)
    score_parser.set_defaults(func=score_command)

    queue_parser = subparsers.add_parser("queue", help="Print the current review queue as JSON")
    _add_common_score_args(queue_parser)
    queue_parser.add_argument(
        "--status",
        default=None,
        choices=["pending", "approved", "dismissed", "escalated", "declined", "blocked"],
    )
    queue_parser.set_defaults(func=queue_command)

    review_parser = subparsers.add_parser("review", help="Apply a reviewer decision to one transaction")
    review_parser.add_argument("transaction_id")
    review_parser.add_argument("--action", required=True, choices=["approve", "dismiss", "escalate", "decline", "block"])
    review_parser.add_argument("--reviewer", default="agent_reviewer")
    review_parser.add_argument("--reviewer-confidence", type=float, default=None)
    review_parser.add_argument("--note", default=None)
    review_parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    review_parser.set_defaults(func=review_command)

    undo_parser = subparsers.add_parser("undo", help="Undo the last review action")
    undo_parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    undo_parser.set_defaults(func=undo_command)

    next_parser = subparsers.add_parser("next", help="Print the next flagged transaction by review status")
    _add_common_score_args(next_parser)
    next_parser.add_argument(
        "--status",
        default="pending",
        choices=["pending", "approved", "dismissed", "escalated", "declined", "blocked"],
    )
    next_parser.set_defaults(func=next_command)

    context_parser = subparsers.add_parser("context", help="Print transaction entity context")
    context_parser.add_argument("transaction_id")
    _add_common_score_args(context_parser)
    context_parser.set_defaults(func=context_command)

    serve_parser = subparsers.add_parser("serve", help="Run a local reviewer API")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8787)
    serve_parser.add_argument("--input", default=str(DEFAULT_TRANSACTION_CSV))
    serve_parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    serve_parser.add_argument("--profile", default="balanced", choices=["conservative", "balanced", "aggressive"])
    serve_parser.set_defaults(func=serve_command)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
