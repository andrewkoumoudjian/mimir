# Mimir

Mimir is an all-in-one platform for expense intelligence, fraud detection, compliance, and reporting.

The current repository is organized around three working areas:

- `mimir/`: the main application and reusable packages.
- `valsoft/`: fraud detection challenge data, planning, and generated analysis targets.
- `brim/`: compliance, reporting, and expense intelligence materials.
- `ref/`: reference implementations, research notes, and external examples used for comparison.

## Current Focus

The active build is the Mimir fraud engine for the Valsoft transaction intelligence workflow. It scores transactions, explains risk signals, and produces review queues for analyst triage.

Run the current fraud scoring flow from the repository root:

```bash
PYTHONPATH=mimir/packages/mimir-fraud/src \
  python3 -m mimir.cli score \
  --input valsoft/data/transactions.csv \
  --output-dir valsoft/output \
  --profile balanced
```

See `mimir/README.md` for the fraud engine details, reviewer commands, API endpoints, package layout, and test commands.

## Packages

- `mimir/packages/mimir-fraud`: Python fraud and transaction risk engine.
- `mimir/packages/mimir-core`: Rust-backed shared primitives exposed to Python.
- `mimir/packages/synthetic-pipeline`: Rust-backed synthetic transaction generation experiments.
- `mimir/packages/data-primitives`: reserved for ingestion and normalization primitives.

## Development Notes

This repository is under active development. Generated outputs, local build artifacts, virtual environments, and editor state are intentionally ignored.
