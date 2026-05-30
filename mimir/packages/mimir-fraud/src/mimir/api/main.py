"""Dependency-light HTTP API for reviewer-ready demos."""

from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from mimir.api.routes_review import apply_decision, undo_last
from mimir.api.routes_transactions import get_queue, get_summary, get_transactions
from mimir.core.paths import DEFAULT_OUTPUT_DIR, DEFAULT_TRANSACTION_CSV, ensure_output_dir
from mimir.engine import run_fraud_engine
from mimir.review.review_state import ReviewState


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
        self.state_path = self.output_dir / "review_state.json"
        self.audit_log_path = self.output_dir / "audit_log.jsonl"
        self.state = ReviewState.load(self.state_path)
        self.result = run_fraud_engine(
            input_path=self.input_path,
            output_dir=self.output_dir,
            profile=profile,
            state_path=self.state_path,
            write_outputs=True,
        )

    def reload(self) -> None:
        self.state = ReviewState.load(self.state_path)
        self.result = run_fraud_engine(
            input_path=self.input_path,
            output_dir=self.output_dir,
            profile=self.profile,
            state_path=self.state_path,
            write_outputs=True,
        )


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
            self._send({"error": "Not found"}, HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:  # noqa: N802
            if self.path == "/review":
                try:
                    payload = apply_decision(
                        self._read_body(),
                        api.state,
                        api.state_path,
                        api.audit_log_path,
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
    print("Endpoints: /summary, /queue, /transactions, POST /review, POST /undo")
    server.serve_forever()
