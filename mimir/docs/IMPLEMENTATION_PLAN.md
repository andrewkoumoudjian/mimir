# Implementation Plan

## Architecture

The active backend package is `mimir/src/mimir-fraud`. It exposes the import package `mimir.*` and contains:

- `core`: shared contracts, constants, and repository paths.
- `data`: CSV loading and validation.
- `features`: per-card, categorical, temporal, Rust-backed graph/collective, and model-consensus features.
- `features.xfraud_graph`: xFraud-backed graph scoring over transaction/entity edges.
- `scoring`: weighted risk score, thresholds, risk levels, and reason generation.
- `context`: transaction/entity/timeline/graph contracts shared by API and CLI.
- `review`: file-backed reviewer state, undo, audit log, and feedback suppression.
- `export`: updated CSV and frontend-ready JSON.
- `api`: dependency-light local HTTP API.
- `cli.py`: one-command scoring, queue, review, undo, and serve commands.
- `primitives`: adapters for `mimir-core`, `xfraud-ml`, and `synthetic-pipeline`.

The reviewer dashboard lives in `mimir/mimir/app`. It is a Vite React app that renders the local API queue as a one-at-a-time review surface with action buttons, undo, cost tuning, reason evidence, graph highlighting, card timeline, related transactions, and audit trail.

The existing `mimir/packages/mimir-core`, `mimir/packages/xfraud-ml`, and `mimir/packages/synthetic-pipeline` Rust-backed Python packages are now part of the runtime path. `data-primitives` remains a future extraction point for shared ingestion adapters once the Brim layer starts.

## Tech Choices

Python is the right fit for the challenge because the dataset is small, the feature work is tabular, and Polars/Pydantic/scikit-learn are already available. Rust would be faster but would slow down iteration on anomaly signals and JSON contracts.

Polars handles CSV ingestion and output. Pydantic locks the JSON contracts. `mimir_core.TransactionProcessor` supplies live-compatible graph and collective features. `xfraud_ml` supplies a Rust-backed graph model that produces `xfraud_graph_score` and model metrics. Scikit-learn IsolationForest is used only as a secondary consensus signal. The local API uses the Python standard library because FastAPI is not installed in the environment.

## Detection Build Order

1. Load and validate the full CSV.
2. Build robust per-card baselines.
3. Add categorical surprisal and temporal windows.
4. Stream each row through the Rust graph primitive for merchant/device/IP relationships.
5. Train and score the xFraud graph layer from documented pseudo-labels.
6. Score with the required component weights and calibrate to reviewer-facing 0-1 risk.
7. Generate reason codes with exact evidence.
8. Export CSV/JSON and wire review state.
9. Expose transaction context, entity lookup, card timeline, and graph endpoints.

## Skipped for Now

- Fully supervised fraud model: the challenge data has no true labels, so xFraud uses high-confidence heuristic flags plus reviewer feedback as pseudo-labels.
- Persistent database: JSON/JSONL is enough for the demo and simple to inspect.
