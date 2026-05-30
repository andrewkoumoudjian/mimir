# Mimir Valsoft Fraud Engine

Mimir is a unified transaction intelligence platform. This build focuses first on the Valsoft Fraud Hunter challenge: ingest `transactions.csv`, score all 1,000 transactions, explain every flag, export an updated CSV, and expose a reviewer-ready queue with approve, dismiss, escalate, and undo.

## Run

From the repository root:

```bash
PYTHONPATH=mimir/packages/mimir-fraud/src \
  python3 -m mimir.cli score \
  --input valsoft/data/transactions.csv \
  --output-dir valsoft/output \
  --profile balanced
```

Outputs:

- `valsoft/output/transactions_with_mimir_risk.csv`
- `valsoft/output/risk_results.json`
- `valsoft/output/review_queue.json`
- `valsoft/output/review_state.json` after reviewer actions
- `valsoft/output/audit_log.jsonl` after reviewer actions

Reviewer commands:

```bash
PYTHONPATH=mimir/packages/mimir-fraud/src python3 -m mimir.cli queue
PYTHONPATH=mimir/packages/mimir-fraud/src python3 -m mimir.cli review tx_000985 --action escalate --note "Gift-card cashout"
PYTHONPATH=mimir/packages/mimir-fraud/src python3 -m mimir.cli undo
PYTHONPATH=mimir/packages/mimir-fraud/src python3 -m mimir.cli serve --port 8787
```

API endpoints from `serve`: `GET /summary`, `GET /queue`, `GET /transactions`, `POST /review`, `POST /undo`.

## Detection Strategy

Mimir uses a transparent layered anomaly engine:

- Per-card baselines: robust log amount z-score, amount-to-card-median ratio, new category, new merchant, new device, new IP, unusual channel/country.
- Categorical surprisal: smoothed negative log probability for merchant/category/channel/country/device/IP behavior conditioned on the card.
- Temporal velocity: 10-minute, 60-minute, and 24-hour windows for card testing, repeated high-risk purchases, split purchases, and merchant bursts.
- Graph/collective features: merchant unique cards, shared device/IP, IP prefix bursts, rare merchant/category/country clusters.
- Model consensus: deterministic IsolationForest percentile score as secondary evidence only.

Default balanced mode flags the top 8% of transactions. Conservative and aggressive modes flag smaller or larger queues. Cost-aware tuning is available with `--false-positive-cost` and `--false-negative-cost`.

## Current Results

Balanced profile on the provided dataset processes all 1,000 rows and flags 80 transactions. The queue is dominated by the discovered fraud families: high-value gift-card/electronics purchases, low-dollar online card testing bursts, and cross-card QuickPay bursts.

## Tests

```bash
cd mimir/packages/mimir-fraud
PYTHONPATH=src pytest
```

## Package Layout

- `mimir/packages/mimir-fraud`: active Valsoft fraud/risk engine.
- `mimir/packages/mimir-core`: Rust-backed shared primitives for graph sampling, feature storage, explanation scoring, and streaming transaction features.
- `mimir/packages/synthetic-pipeline`: Rust-backed synthetic transaction generator trained from the bundled transaction sample.
- `mimir/packages/data-primitives`: reserved for cross-source ingestion normalization.
- `mimir/src/app`: existing app scaffold, kept separate from the backend package.

## Another Week

With another week, I would add a richer keyboard-driven frontend, tune thresholds against labeled review outcomes, split shared schema/loading into `mimir-core` and `data-primitives`, add conformal/FDR calibration, and persist reviewer decisions in SQLite rather than JSON files.
