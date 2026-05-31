"""xFraud-backed graph scoring with documented pseudo-labels."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import polars as pl

from mimir.core.constants import HIGH_AMOUNT_LIMIT, HIGH_RISK_CATEGORIES, SMALL_AMOUNT_LIMIT
from mimir.core.schemas import TransactionReview
from mimir.scoring.normalize import clip01


PSEUDO_LABEL_POLICY = (
    "Reviewer feedback overrides heuristics: declined/blocked transactions are "
    "positive pseudo-labels, escalated transactions are weak positive pseudo-labels, "
    "and approved/dismissed transactions are negative pseudo-labels. "
    "Without feedback, only high-confidence deterministic fraud flags become "
    "positive labels and low-anomaly stable transactions become negative labels. "
    "Ambiguous transactions are excluded from training but still scored."
)


@dataclass(frozen=True)
class PseudoLabel:
    """A pseudo-label used to seed xFraud training."""

    label: int
    source: str
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class XFraudFeatureResult:
    """Feature frame plus model report from xFraud scoring."""

    frame: pl.DataFrame
    report: dict[str, Any]


def add_xfraud_graph_score(
    df: pl.DataFrame,
    review_status_by_transaction: dict[str, TransactionReview] | None = None,
) -> XFraudFeatureResult:
    """Attach an xFraud graph score trained from pseudo-labels."""

    rows = df.sort("_timestamp_dt").to_dicts()
    pseudo_labels = {
        str(row["transaction_id"]): _pseudo_label(row, review_status_by_transaction or {})
        for row in rows
    }
    labeled = {tx_id: label for tx_id, label in pseudo_labels.items() if label is not None}
    label_counts = _label_counts(labeled.values())
    base_scores = {
        str(row["transaction_id"]): _heuristic_prior_score(row, pseudo_labels[str(row["transaction_id"])])
        for row in rows
    }

    if label_counts["positive"] == 0 or label_counts["negative"] == 0 or len(labeled) < 8:
        report = {
            "available": False,
            "score_column": "xfraud_graph_score",
            "pseudo_label_policy": PSEUDO_LABEL_POLICY,
            "fallback": "insufficient_positive_and_negative_pseudo_labels",
            "pseudo_label_counts": label_counts,
        }
        return XFraudFeatureResult(_with_xfraud_columns(df, rows, base_scores, pseudo_labels, report), report)

    try:
        from xfraud_ml import TrainingConfig, XFraudTrainer, XFraudTrainingData
    except ImportError as exc:
        report = {
            "available": False,
            "score_column": "xfraud_graph_score",
            "pseudo_label_policy": PSEUDO_LABEL_POLICY,
            "fallback": "xfraud_ml_unavailable",
            "error": str(exc),
            "pseudo_label_counts": label_counts,
        }
        return XFraudFeatureResult(_with_xfraud_columns(df, rows, base_scores, pseudo_labels, report), report)

    edge_tuples, features = _build_graph_inputs(rows, pseudo_labels, prediction_mode=False)
    prediction_edges, prediction_features = _build_graph_inputs(rows, pseudo_labels, prediction_mode=True)

    try:
        training_data = XFraudTrainingData.from_edge_tuples(edge_tuples, features)
        prediction_data = XFraudTrainingData.from_edge_tuples(prediction_edges, prediction_features)
        config = TrainingConfig(
            width=6,
            depth=2,
            positive_per_batch=8,
            negative_per_batch=16,
            n_batch=8,
            max_epochs=12,
            patience=4,
            learning_rate=0.06,
            l2=0.0001,
            random_seed=2020,
            sample_method="sage",
            conv_name="sage-mean",
            train_ratio=0.72,
            valid_ratio=0.9,
        )
        model = XFraudTrainer.from_config(config).train(training_data)
        model_scores = {
            node_id.removeprefix("tx:"): float(score)
            for node_id, score in model.predict_proba(prediction_data)
            if node_id.startswith("tx:")
        }
        scores = {
            tx_id: round(clip01(0.78 * model_scores.get(tx_id, base_score) + 0.22 * base_score), 4)
            for tx_id, base_score in base_scores.items()
        }
        model_metrics = model.metrics()
        report = {
            "available": True,
            "score_column": "xfraud_graph_score",
            "pseudo_label_policy": PSEUDO_LABEL_POLICY,
            "pseudo_label_counts": label_counts,
            "training_graph": {
                "node_count": training_data.node_count(),
                "edge_count": training_data.edge_count(),
                "edge_type_count": training_data.edge_type_count(),
                "seed_count": training_data.seed_count(),
                "feature_dim": training_data.feature_dim(),
            },
            "model_metrics": model_metrics,
        }
        return XFraudFeatureResult(_with_xfraud_columns(df, rows, scores, pseudo_labels, report), report)
    except Exception as exc:
        report = {
            "available": False,
            "score_column": "xfraud_graph_score",
            "pseudo_label_policy": PSEUDO_LABEL_POLICY,
            "fallback": "xfraud_training_failed",
            "error": str(exc),
            "pseudo_label_counts": label_counts,
        }
        return XFraudFeatureResult(_with_xfraud_columns(df, rows, base_scores, pseudo_labels, report), report)


def _pseudo_label(
    row: dict[str, Any],
    review_status_by_transaction: dict[str, TransactionReview],
) -> PseudoLabel | None:
    transaction_id = str(row["transaction_id"])
    review = review_status_by_transaction.get(transaction_id)
    if review is not None:
        if review.status in {"declined", "blocked"}:
            return PseudoLabel(
                label=1,
                source=f"reviewer_{review.status}",
                evidence={"review_status": review.status, "final_reviewer_truth": True},
            )
        if review.status == "escalated":
            return PseudoLabel(
                label=1,
                source="reviewer_escalated_weak",
                evidence={"review_status": review.status, "final_reviewer_truth": False},
            )
        if review.status in {"approved", "dismissed"}:
            return PseudoLabel(
                label=0,
                source=f"reviewer_{review.status}",
                evidence={"review_status": review.status},
            )

    category = str(row.get("merchant_category") or "")
    amount = float(row.get("amount") or 0.0)
    if (
        str(row.get("channel")) == "online"
        and amount <= SMALL_AMOUNT_LIMIT
        and int(row.get("card_small_tx_count_60m") or 0) >= 6
        and int(row.get("card_online_tx_count_60m") or 0) >= 6
    ):
        return PseudoLabel(
            label=1,
            source="heuristic_card_testing_velocity",
            evidence={
                "small_tx_count_60m": int(row.get("card_small_tx_count_60m") or 0),
                "online_tx_count_60m": int(row.get("card_online_tx_count_60m") or 0),
            },
        )
    if category in HIGH_RISK_CATEGORIES and amount >= HIGH_AMOUNT_LIMIT:
        return PseudoLabel(
            label=1,
            source="heuristic_high_risk_category_amount",
            evidence={"merchant_category": category, "amount": amount},
        )
    if bool(row.get("unusual_merchant_hit_by_many_cards")) and int(row.get("merchant_unique_cards_60m") or 0) >= 4:
        return PseudoLabel(
            label=1,
            source="heuristic_merchant_burst",
            evidence={"merchant_unique_cards_60m": int(row.get("merchant_unique_cards_60m") or 0)},
        )
    if int(row.get("device_unique_cards_total") or 0) >= 4 and bool(row.get("shared_device_with_other_cards")):
        return PseudoLabel(
            label=1,
            source="heuristic_shared_device_across_cards",
            evidence={"device_unique_cards_total": int(row.get("device_unique_cards_total") or 0)},
        )

    low_anomaly = (
        category not in HIGH_RISK_CATEGORIES
        and amount <= 180
        and abs(float(row.get("robust_z_log_amount") or 0.0)) < 1.5
        and float(row.get("amount_ratio_to_card_median") or 0.0) < 2.2
        and int(row.get("card_tx_count_60m") or 0) <= 2
        and int(row.get("merchant_unique_cards_60m") or 0) <= 2
        and not bool(row.get("category_is_new_for_card"))
        and not bool(row.get("device_is_new_for_card"))
        and not bool(row.get("ip_is_new_for_card"))
        and not bool(row.get("country_mismatch"))
        and not bool(row.get("shared_device_with_other_cards"))
    )
    if low_anomaly:
        return PseudoLabel(
            label=0,
            source="heuristic_stable_low_anomaly",
            evidence={
                "amount_ratio_to_card_median": float(row.get("amount_ratio_to_card_median") or 0.0),
                "robust_z_log_amount": float(row.get("robust_z_log_amount") or 0.0),
            },
        )
    return None


def _heuristic_prior_score(row: dict[str, Any], label: PseudoLabel | None) -> float:
    if label is not None:
        return 0.92 if label.label == 1 else 0.08
    signals = [
        min(abs(float(row.get("robust_z_log_amount") or 0.0)) / 6.0, 1.0),
        min(float(row.get("amount_ratio_to_card_median") or 0.0) / 8.0, 1.0),
        float(row.get("merchant_burst_score") or 0.0),
        min(float(row.get("model_consensus_score") or 0.0), 1.0),
        1.0 if bool(row.get("shared_device_with_other_cards")) else 0.0,
        1.0 if bool(row.get("unusual_merchant_hit_by_many_cards")) else 0.0,
    ]
    return round(clip01(sum(signals) / len(signals)), 4)


def _build_graph_inputs(
    rows: list[dict[str, Any]],
    pseudo_labels: dict[str, PseudoLabel | None],
    prediction_mode: bool,
) -> tuple[list[tuple[str, str, int, int, str, str, str, int]], dict[str, list[float]]]:
    edge_tuples: list[tuple[str, str, int, int, str, str, str, int]] = []
    features: dict[str, list[float]] = {}
    entity_vectors: dict[str, list[list[float]]] = {}

    for row in rows:
        tx_id = str(row["transaction_id"])
        tx_node = f"tx:{tx_id}"
        pseudo_label = pseudo_labels[tx_id]
        label = int(pseudo_label.label) if pseudo_label is not None else 0
        seed = 1 if prediction_mode or pseudo_label is not None else 0
        ts = _timestamp_seconds(row.get("_timestamp_dt"))
        tx_features = _feature_vector(row)
        features[tx_node] = tx_features

        for entity_node, entity_type, edge_type in _entity_nodes(row):
            edge_tuples.append(
                (
                    tx_node,
                    entity_node,
                    ts,
                    label,
                    "transaction",
                    entity_type,
                    edge_type,
                    seed,
                )
            )
            entity_vectors.setdefault(entity_node, []).append(tx_features)

    for node_id, vectors in entity_vectors.items():
        features[node_id] = _mean_vector(vectors)
    return edge_tuples, features


def _feature_vector(row: dict[str, Any]) -> list[float]:
    category = str(row.get("merchant_category") or "")
    return [
        min(float(row.get("amount") or 0.0) / 1000.0, 5.0),
        min(float(row.get("amount_ratio_to_card_median") or 0.0) / 10.0, 5.0),
        min(abs(float(row.get("robust_z_log_amount") or 0.0)) / 8.0, 5.0),
        min(float(row.get("card_tx_count_60m") or 0.0) / 10.0, 5.0),
        min(float(row.get("merchant_unique_cards_60m") or 0.0) / 10.0, 5.0),
        float(row.get("merchant_burst_score") or 0.0),
        min(float(row.get("device_unique_cards_total") or 0.0) / 8.0, 5.0),
        min(float(row.get("ip_unique_cards_total") or 0.0) / 8.0, 5.0),
        float(row.get("model_consensus_score") or 0.0),
        1.0 if category in HIGH_RISK_CATEGORIES else 0.0,
        1.0 if bool(row.get("country_mismatch")) else 0.0,
        1.0 if bool(row.get("shared_device_with_other_cards")) else 0.0,
        1.0 if bool(row.get("shared_ip_with_other_cards")) else 0.0,
        min(float(row.get("categorical_surprisal_raw") or 0.0) / 4.0, 5.0),
    ]


def _entity_nodes(row: dict[str, Any]) -> list[tuple[str, str, str]]:
    nodes = [
        (f"card:{row['card_id']}", "card", "uses_card"),
        (f"merchant:{row['merchant_name']}", "merchant", "paid_merchant"),
        (
            f"cluster:{row['merchant_category']}|{row['merchant_country']}",
            "category_country_cluster",
            "in_category_country_cluster",
        ),
    ]
    if row.get("device_id"):
        nodes.append((f"device:{row['device_id']}", "device", "used_device"))
    if row.get("ip_address"):
        nodes.append((f"ip:{row['ip_address']}", "ip", "used_ip"))
    return nodes


def _mean_vector(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        return []
    width = len(vectors[0])
    return [sum(vector[idx] for vector in vectors) / len(vectors) for idx in range(width)]


def _with_xfraud_columns(
    df: pl.DataFrame,
    rows: list[dict[str, Any]],
    scores: dict[str, float],
    pseudo_labels: dict[str, PseudoLabel | None],
    report: dict[str, Any],
) -> pl.DataFrame:
    score_values: list[float] = []
    label_values: list[int] = []
    source_values: list[str] = []
    valid_auc_values: list[float] = []
    seed_count_values: list[int] = []

    valid_auc = (
        report.get("model_metrics", {})
        .get("valid", {})
        .get("auc", 0.5)
        if isinstance(report.get("model_metrics"), dict)
        else 0.5
    )
    seed_count = int(report.get("training_graph", {}).get("seed_count", len([label for label in pseudo_labels.values() if label])))

    for row in rows:
        tx_id = str(row["transaction_id"])
        label = pseudo_labels[tx_id]
        score_values.append(scores.get(tx_id, 0.0))
        label_values.append(label.label if label is not None else -1)
        source_values.append(label.source if label is not None else "unlabeled_scored")
        valid_auc_values.append(float(valid_auc or 0.5))
        seed_count_values.append(seed_count)

    return df.join(
        pl.DataFrame(
            {
                "transaction_id": [str(row["transaction_id"]) for row in rows],
                "xfraud_graph_score": score_values,
                "xfraud_pseudo_label": label_values,
                "xfraud_label_source": source_values,
                "xfraud_valid_auc": valid_auc_values,
                "xfraud_training_seed_count": seed_count_values,
            }
        ),
        on="transaction_id",
        how="left",
    )


def _label_counts(labels: Any) -> dict[str, int]:
    positive = 0
    negative = 0
    sources: dict[str, int] = {}
    for label in labels:
        if label.label == 1:
            positive += 1
        else:
            negative += 1
        sources[label.source] = sources.get(label.source, 0) + 1
    return {
        "positive": positive,
        "negative": negative,
        "total": positive + negative,
        "sources": sources,  # type: ignore[dict-item]
    }


def _timestamp_seconds(value: Any) -> int:
    if hasattr(value, "timestamp"):
        return int(value.timestamp())
    return 0
