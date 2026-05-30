# Mimir Valsoft Fraud Engine

Mimir is a unified transaction intelligence platform. This build focuses first on the Valsoft Fraud Hunter challenge: ingest `transactions.csv`, score all 1,000 transactions, explain every flag, export an updated CSV, and expose a reviewer-ready queue with approve, dismiss, escalate, and undo.

## Setup

From the repository root:

```bash
python3.12 -m pip install -q maturin
python3.12 -m pip install -e mimir/packages/mimir-core
python3.12 -m pip install -e mimir/packages/xfraud-ml
python3.12 -m pip install -e mimir/packages/synthetic-pipeline
```

## Run the detector

```bash
PYTHONPATH=mimir/src/mimir-fraud/src \
  python3.12 -m mimir.cli score \
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
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m mimir.cli queue
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m mimir.cli review tx_000985 --action escalate --note "Gift-card cashout"
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m mimir.cli undo
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m mimir.cli serve --port 8787
```

API endpoints from `serve`: `GET /summary`, `GET /queue`, `GET /transactions`, `POST /review`, `POST /undo`.

## Run the dashboard

Start the API first, then in another terminal:

```bash
cd mimir/mimir/app
npm install
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`. The dashboard uses Fragments UI for the app/sidebar shell and Base UI for the sidebar controls. Keyboard queue actions: arrow keys move, `A` approves, `D` dismisses, `E` escalates, and `U` undoes.

## Detection Strategy

Mimir uses a transparent layered anomaly engine:

- Per-card baselines: robust log amount z-score, amount-to-card-median ratio, new category, new merchant, new device, new IP, unusual channel/country.
- Categorical surprisal: smoothed negative log probability for merchant/category/channel/country/device/IP behavior conditioned on the card.
- Temporal velocity: 10-minute, 60-minute, and 24-hour windows for card testing, repeated high-risk purchases, split purchases, and merchant bursts.
- Rust-backed graph/collective primitive: `mimir_core.TransactionProcessor` streams transactions in timestamp order and emits merchant, device, IP, IP-prefix, and rare-cluster signals.
- Model consensus: deterministic IsolationForest percentile score as secondary evidence only.

Default balanced mode flags the top 8% of transactions. Conservative and aggressive modes flag smaller or larger queues. Cost-aware tuning is available with `--false-positive-cost` and `--false-negative-cost`.

The run summary also reports active Rust primitives: `mimir-core` for stream features, `xfraud-ml` for xFraud-style graph probes, and `synthetic-pipeline` for future live synthetic transaction sources.

## Current Results

Balanced profile on the provided dataset processes all 1,000 rows and flags 80 transactions. The queue is dominated by the discovered fraud families: high-value gift-card/electronics purchases, low-dollar online card testing bursts, and cross-card QuickPay bursts.

## Tests

```bash
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m pytest mimir/src/mimir-fraud/tests
cd mimir/mimir/app && npm run lint && npm run build
```

## Package Layout

- `mimir/src/mimir-fraud`: active Valsoft fraud/risk engine.
- `mimir/packages/mimir-core`: Rust-backed shared primitives for graph sampling, feature storage, explanation scoring, and streaming transaction features.
- `mimir/packages/xfraud-ml`: pure-Rust xFraud-style graph sampling and detector training package.
- `mimir/packages/synthetic-pipeline`: Rust-backed synthetic transaction generator trained from the bundled transaction sample.
- `mimir/packages/data-primitives`: reserved for cross-source ingestion normalization.
- `mimir/mimir/app`: reviewer dashboard.

## Another Week

With another week, I would tune thresholds against labeled review outcomes, add a streaming API fed directly by `synthetic-pipeline`, add conformal/FDR calibration, and persist reviewer decisions in SQLite rather than JSON files.
