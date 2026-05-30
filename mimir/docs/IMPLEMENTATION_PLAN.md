# Implementation Plan

## Architecture

The active backend package is `mimir/packages/mimir-fraud`. It exposes the import package `mimir.*` and contains:

- `core`: shared contracts, constants, and repository paths.
- `data`: CSV loading and validation.
- `features`: per-card, categorical, temporal, graph, and model-consensus features.
- `scoring`: weighted risk score, thresholds, risk levels, and reason generation.
- `review`: file-backed reviewer state, undo, audit log, and feedback suppression.
- `export`: updated CSV and frontend-ready JSON.
- `api`: dependency-light local HTTP API.
- `cli.py`: one-command scoring, queue, review, undo, and serve commands.

The existing `mimir/packages/mimir-core` and `mimir/packages/data-primitives` folders are intentionally left as future extraction points. They should receive shared transaction schemas and ingestion adapters once the Brim layer starts.

## Tech Choices

Python is the right fit for the challenge because the dataset is small, the feature work is tabular, and Polars/Pydantic/scikit-learn are already available. Rust would be faster but would slow down iteration on anomaly signals and JSON contracts.

Polars handles CSV ingestion and output. Pydantic locks the JSON contracts. Scikit-learn IsolationForest is used only as a secondary consensus signal. The local API uses the Python standard library because FastAPI is not installed in the environment.

## Detection Build Order

1. Load and validate the full CSV.
2. Build robust per-card baselines.
3. Add categorical surprisal and temporal windows.
4. Add graph-derived collective features for merchant/device/IP relationships.
5. Score with the required component weights and calibrate to reviewer-facing 0-1 risk.
6. Generate reason codes with exact evidence.
7. Export CSV/JSON and wire review state.

## Skipped for Now

- Full frontend queue: CLI/API outputs are ready for one, but backend quality came first.
- Full GNN/xFraud reproduction: graph-derived signals are more explainable and appropriate for 1,000 rows.
- Persistent database: JSON/JSONL is enough for the demo and simple to inspect.
