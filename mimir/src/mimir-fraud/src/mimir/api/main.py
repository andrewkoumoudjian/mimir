"""Dependency-light HTTP API for reviewer-ready demos."""

from __future__ import annotations

import json
from datetime import date, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from mimir.api.routes_review import apply_decision, undo_last
from mimir.api.routes_transactions import (
    get_card_timeline,
    get_entity,
    get_graph,
    get_queue,
    get_summary,
    get_transaction_context,
    get_transactions,
)
from mimir.core.paths import DEFAULT_OUTPUT_DIR, DEFAULT_TRANSACTION_CSV, ensure_output_dir
from mimir.engine import run_fraud_engine
from mimir.review.audit_log import read_audit_events
from mimir.review.review_state import ReviewState
from mimir.review.training_status import build_training_status


class ReviewerApi:
    """Small stateful API wrapper around one engine run."""

    def __init__(
        self,
        input_path: str | Path = DEFAULT_TRANSACTION_CSV,
        output_dir: str | Path = DEFAULT_OUTPUT_DIR,
        profile: str = "balanced",
    ) -> None:
        self.input_path = Path(input_path)
        self.output_dir = ensure_output_dir(output_dir)
        self.profile = profile
        self.false_positive_cost: float | None = None
        self.false_negative_cost: float | None = None
        self.state_path = self.output_dir / "review_state.json"
        self.audit_log_path = self.output_dir / "audit_log.jsonl"
        self.state = ReviewState.load(self.state_path)
        self.result = run_fraud_engine(
            input_path=self.input_path,
            output_dir=self.output_dir,
            profile=profile,
            state_path=self.state_path,
            false_positive_cost=self.false_positive_cost,
            false_negative_cost=self.false_negative_cost,
            write_outputs=True,
        )
        self.attach_audit_training_status()

    def reload(self) -> None:
        self.state = ReviewState.load(self.state_path)
        self.result = run_fraud_engine(
            input_path=self.input_path,
            output_dir=self.output_dir,
            profile=self.profile,
            state_path=self.state_path,
            false_positive_cost=self.false_positive_cost,
            false_negative_cost=self.false_negative_cost,
            write_outputs=True,
        )
        self.attach_audit_training_status()

    def feedback_context_for(self, transaction_id: str) -> dict[str, Any]:
        risk = next((item for item in self.result.risks if item.transaction_id == transaction_id), None)
        feature_snapshot = next(
            (
                row
                for row in self.result.feature_frame.to_dicts()
                if str(row.get("transaction_id")) == transaction_id
            ),
            {},
        )
        return {
            "feature_snapshot": _json_safe(feature_snapshot),
            "original_score": risk.risk_score if risk is not None else None,
            "original_reasons": risk.reasons if risk is not None else [],
            "model_version": risk.model_version if risk is not None else self.result.summary.model_version,
        }

    def attach_audit_training_status(self) -> None:
        xfraud_status = self.result.summary.primitive_status.setdefault("xfraud_training", {})
        xfraud_status.update(
            build_training_status(
                self.state,
                read_audit_events(self.audit_log_path),
                xfraud_available=bool(xfraud_status.get("available")),
                current_model_version=self.result.summary.model_version,
            )
        )

    def apply_cost_query(self, query: dict[str, list[str]]) -> None:
        if "false_positive_cost" not in query or "false_negative_cost" not in query:
            return
        fp = _query_float(query, "false_positive_cost")
        fn = _query_float(query, "false_negative_cost")
        if fp == self.false_positive_cost and fn == self.false_negative_cost:
            return
        self.false_positive_cost = fp
        self.false_negative_cost = fn
        self.reload()


def make_handler(api: ReviewerApi):
    class Handler(BaseHTTPRequestHandler):
        server_version = "MimirReviewerApi/0.1"

        def _send(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
            data = json.dumps(payload, indent=2).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(data)

        def _read_body(self) -> dict:
            length = int(self.headers.get("Content-Length", "0"))
            if length == 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._send({"ok": True})

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            api.apply_cost_query(query)
            parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
            if parsed.path == "/health":
                self._send({"ok": True, "service": "mimir-fraud"})
                return
            if parsed.path == "/summary":
                self._send(get_summary(api.result))
                return
            if parsed.path == "/transactions":
                self._send(get_transactions(api.result))
                return
            if parsed.path == "/queue":
                queue = get_queue(api.result)
                status_filter = query.get("status", [None])[0]
                if status_filter:
                    queue = [item for item in queue if item["review"]["status"] == status_filter]
                self._send(queue)
                return
            if len(parts) == 3 and parts[0] == "transactions" and parts[2] == "context":
                try:
                    self._send(get_transaction_context(api.result, parts[1]))
                except KeyError:
                    self._send({"error": "Transaction not found"}, HTTPStatus.NOT_FOUND)
                return
            if len(parts) == 3 and parts[0] == "entities":
                try:
                    self._send(get_entity(api.result, parts[1], parts[2]))
                except KeyError as exc:
                    self._send({"error": str(exc)}, HTTPStatus.NOT_FOUND)
                return
            if len(parts) == 3 and parts[0] == "cards" and parts[2] == "timeline":
                self._send(get_card_timeline(api.result, parts[1]))
                return
            if parsed.path == "/graph":
                transaction_id = query.get("transaction_id", [None])[0]
                try:
                    self._send(get_graph(api.result, transaction_id))
                except KeyError:
                    self._send({"error": "Transaction not found"}, HTTPStatus.NOT_FOUND)
                return
            if parsed.path == "/audit":
                events = [event.model_dump(mode="json") for event in read_audit_events(api.audit_log_path)]
                self._send(events)
                return
            self._send({"error": "Not found"}, HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:  # noqa: N802
            if self.path == "/review":
                try:
                    body = self._read_body()
                    payload = apply_decision(
                        body,
                        api.state,
                        api.state_path,
                        api.audit_log_path,
                        feedback_context=api.feedback_context_for(str(body.get("transaction_id", ""))),
                    )
                    api.reload()
                    self._send(payload)
                except Exception as exc:
                    self._send({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            if self.path == "/undo":
                payload = undo_last(api.state, api.state_path, api.audit_log_path)
                api.reload()
                self._send(payload)
                return
            self._send({"error": "Not found"}, HTTPStatus.NOT_FOUND)

        def log_message(self, format: str, *args) -> None:  # noqa: A002
            return

    return Handler


def run_server(
    host: str = "127.0.0.1",
    port: int = 8787,
    input_path: str | Path = DEFAULT_TRANSACTION_CSV,
    output_dir: str | Path = DEFAULT_OUTPUT_DIR,
    profile: str = "balanced",
) -> None:
    """Run the local reviewer API until interrupted."""

    api = ReviewerApi(input_path=input_path, output_dir=output_dir, profile=profile)
    server = ThreadingHTTPServer((host, port), make_handler(api))
    print(f"Mimir reviewer API listening on http://{host}:{port}")
    print("Endpoints: /summary, /queue, /transactions, /transactions/{id}/context, /graph, POST /review, POST /undo")
    server.serve_forever()


def _query_float(query: dict[str, list[str]], key: str) -> float | None:
    value = query.get(key, [None])[0]
    if value in (None, ""):
        return None
    return float(value)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, "item") and callable(value.item):
        return _json_safe(value.item())
    return value
