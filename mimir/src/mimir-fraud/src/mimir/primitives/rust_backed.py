"""Adapters around the Rust-backed Python packages used by the fraud engine."""

from __future__ import annotations

from typing import Any

import polars as pl


class RustPrimitiveUnavailable(RuntimeError):
    """Raised when a required Rust-backed primitive is not installed."""


def _import_mimir_core():
    try:
        from mimir_core import TransactionProcessor
    except ImportError as exc:
        raise RustPrimitiveUnavailable(
            "mimir-core is required for graph/stream fraud primitives. "
            "Install it with `python3.12 -m pip install -e mimir/packages/mimir-core`."
        ) from exc
    return TransactionProcessor


def _optional_import(module_name: str) -> tuple[bool, str | None]:
    try:
        __import__(module_name)
    except ImportError as exc:
        return False, str(exc)
    return True, None


def _import_xfraud_ml():
    try:
        from xfraud_ml import XFraudTrainingData
    except ImportError as exc:
        raise RustPrimitiveUnavailable(
            "xfraud-ml is required for xFraud-style graph probes. "
            "Install it with `python3.12 -m pip install -e mimir/packages/xfraud-ml`."
        ) from exc
    return XFraudTrainingData


def primitive_runtime_status(source_csv: str | None = None) -> dict[str, Any]:
    """Return import/runtime status for all Rust-backed primitive packages."""

    status: dict[str, Any] = {
        "graph_stream": {
            "package": "mimir-core",
            "primitive": "mimir_core.TransactionProcessor",
            "available": False,
        },
        "xfraud_training": {
            "package": "xfraud-ml",
            "primitive": "xfraud_ml.XFraudTrainingData",
            "available": False,
        },
        "synthetic_live_source": {
            "package": "synthetic-pipeline",
            "primitive": "synthetic_pipeline.TransactionProfile",
            "available": False,
        },
    }

    try:
        _import_mimir_core()
        status["graph_stream"]["available"] = True
    except RustPrimitiveUnavailable as exc:
        status["graph_stream"]["error"] = str(exc)

    available, error = _optional_import("xfraud_ml")
    status["xfraud_training"]["available"] = available
    if error:
        status["xfraud_training"]["error"] = error

    try:
        from synthetic_pipeline import TransactionProfile

        status["synthetic_live_source"]["available"] = True
        if source_csv:
            profile = TransactionProfile.from_csv(source_csv)
            status["synthetic_live_source"]["profile"] = profile.summary()
    except ImportError as exc:
        status["synthetic_live_source"]["error"] = str(exc)
    except Exception as exc:  # pragma: no cover - defensive status path
        status["synthetic_live_source"]["profile_error"] = str(exc)

    return status


def build_collective_feature_frame(df: pl.DataFrame) -> pl.DataFrame:
    """Build graph/collective features by streaming rows through Rust."""

    TransactionProcessor = _import_mimir_core()
    processor = TransactionProcessor()
    rows: list[dict[str, Any]] = []
    required_columns = [
        "transaction_id",
        "timestamp",
        "card_id",
        "amount",
        "merchant_name",
        "merchant_category",
        "channel",
        "cardholder_country",
        "merchant_country",
        "device_id",
        "ip_address",
    ]

    for row in df.sort("_timestamp_dt").select(required_columns).to_dicts():
        features = processor.process_transaction(
            str(row["transaction_id"]),
            str(row["timestamp"]),
            str(row["card_id"]),
            float(row["amount"]),
            str(row["merchant_name"]),
            str(row["merchant_category"]),
            str(row["channel"]),
            str(row["cardholder_country"]),
            str(row["merchant_country"]),
            str(row.get("device_id") or "") or None,
            str(row.get("ip_address") or "") or None,
        )
        features["primitive_provider"] = "mimir_core.TransactionProcessor"
        features["primitive_processed_rows"] = processor.processed_rows()
        rows.append(features)

    return pl.from_dicts(rows)


def xfraud_graph_probe(feature_frame: pl.DataFrame) -> dict[str, Any]:
    """Build a lightweight xFraud-style graph object for diagnostics."""

    XFraudTrainingData = _import_xfraud_ml()
    edge_tuples: list[tuple[str, str, int, int, str, str, str, int]] = []
    features: dict[str, list[float]] = {}

    for row in feature_frame.sort("_timestamp_dt").to_dicts():
        transaction_id = str(row["transaction_id"])
        tx_node = f"tx:{transaction_id}"
        timestamp = row.get("_timestamp_dt")
        ts = int(timestamp.timestamp()) if hasattr(timestamp, "timestamp") else 0
        label = 1 if bool(row.get("is_flagged")) else 0
        features[tx_node] = [
            float(row.get("risk_score") or 0.0),
            min(float(row.get("amount") or 0.0) / 1000.0, 5.0),
            min(abs(float(row.get("robust_z_log_amount") or 0.0)) / 10.0, 5.0),
            float(row.get("merchant_burst_score") or 0.0),
            float(row.get("model_consensus_score") or 0.0),
            min(float(row.get("device_unique_cards_total") or 0.0) / 10.0, 5.0),
            min(float(row.get("ip_unique_cards_total") or 0.0) / 10.0, 5.0),
        ]
        neighbors = [
            (f"card:{row['card_id']}", "card", "uses_card"),
            (f"merchant:{row['merchant_name']}", "merchant", "paid_merchant"),
            (
                f"category:{row['merchant_category']}:{row['merchant_country']}",
                "merchant_category_country",
                "category_country",
            ),
        ]
        if row.get("device_id"):
            neighbors.append((f"device:{row['device_id']}", "device", "used_device"))
        if row.get("ip_address"):
            neighbors.append((f"ip:{row['ip_address']}", "ip", "used_ip"))
        for neighbor_id, neighbor_type, edge_type in neighbors:
            features.setdefault(neighbor_id, [0.0] * len(features[tx_node]))
            edge_tuples.append(
                (
                    tx_node,
                    neighbor_id,
                    ts,
                    label,
                    "transaction",
                    neighbor_type,
                    edge_type,
                    1,
                )
            )

    if not edge_tuples:
        return {"available": True, "node_count": 0, "edge_count": 0, "seed_count": 0}

    data = XFraudTrainingData.from_edge_tuples(edge_tuples, features)
    return {
        "available": True,
        "node_count": data.node_count(),
        "edge_count": data.edge_count(),
        "edge_type_count": data.edge_type_count(),
        "seed_count": data.seed_count(),
        "feature_dim": data.feature_dim(),
    }
