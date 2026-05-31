# Mimir Valsoft Fraud Engine

Mimir is a unified transaction intelligence platform. This build focuses first on the Valsoft Fraud Hunter challenge: ingest `transactions.csv`, score all 1,000 transactions, explain every flag, export an updated CSV, and expose a reviewer-ready queue with approve, dismiss, escalate, and undo.

## Setup

From the repository root:

```bash
/Users/andrewkoumoudjian/.local/bin/uv venv --python 3.12 .venv
/Users/andrewkoumoudjian/.local/bin/uv pip install --python .venv/bin/python "maturin>=1.7,<2" pytest
env PATH="$HOME/.local/bin:$PATH" .venv/bin/maturin develop --uv --manifest-path mimir/packages/mimir-core/Cargo.toml
env PATH="$HOME/.local/bin:$PATH" .venv/bin/maturin develop --uv --manifest-path mimir/packages/xfraud-ml/Cargo.toml
env PATH="$HOME/.local/bin:$PATH" .venv/bin/maturin develop --uv --manifest-path mimir/packages/synthetic-pipeline/Cargo.toml
/Users/andrewkoumoudjian/.local/bin/uv pip install --python .venv/bin/python -e mimir/src/mimir-fraud
```

## Run the detector

```bash
.venv/bin/python -m mimir.cli score \
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
.venv/bin/python -m mimir.cli next --status pending
.venv/bin/python -m mimir.cli context tx_000985
.venv/bin/python -m mimir.cli review tx_000985 --action escalate --note "Gift-card cashout"
.venv/bin/python -m mimir.cli undo
.venv/bin/python -m mimir.cli serve --port 8787
```

CLI commands emit JSON only for agent consumption. Review actions default to `agent_reviewer` and write `audit_log.jsonl`.

API endpoints from `serve`: `GET /summary`, `GET /queue`, `GET /transactions`, `GET /transactions/{id}/context`, `GET /entities/{type}/{id}`, `GET /cards/{card_id}/timeline`, `GET /graph?transaction_id=...`, `GET /audit`, `POST /review`, `POST /undo`.

## Run the dashboard

Start the API first, then in another terminal:

```bash
cd mimir/mimir/app
npm install
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`. The dashboard renders a one-at-a-time queue with approve, dismiss, escalate, undo, cost tuning, reasons, audit trail, graph highlighting, and a card timeline.

## Detection Strategy

Mimir uses a transparent layered anomaly engine:

- Per-card baselines: robust log amount z-score, amount-to-card-median ratio, new category, new merchant, new device, new IP, unusual channel/country.
- Categorical surprisal: smoothed negative log probability for merchant/category/channel/country/device/IP behavior conditioned on the card.
- Temporal velocity: 10-minute, 60-minute, and 24-hour windows for card testing, repeated high-risk purchases, split purchases, and merchant bursts.
- Rust-backed graph/collective primitive: `mimir_core.TransactionProcessor` streams transactions in timestamp order and emits merchant, device, IP, IP-prefix, and rare-cluster signals.
- xFraud graph score: `xfraud_ml` trains a small Rust-backed graph model over transaction-card-merchant-device-IP-cluster edges and writes `xfraud_graph_score` for every transaction.
- Model consensus: deterministic IsolationForest percentile score as secondary evidence only.

Default balanced mode flags the top 8% of transactions. Conservative and aggressive modes flag smaller or larger queues. Cost-aware tuning is available with `--false-positive-cost` and `--false-negative-cost`.

The xFraud training labels are pseudo-labels: reviewer escalations are positive, reviewer approvals/dismissals are negative, high-confidence deterministic fraud flags are positive, stable low-anomaly transactions are negative, and ambiguous rows are excluded from training but still scored. The run summary includes xFraud model metrics, and `XFRAUD_GRAPH_SCORE` reasons include pseudo-label evidence when that layer is a driver.

The run summary also reports active Rust primitives: `mimir-core` for stream features, `xfraud-ml` for xFraud scoring and diagnostics, and `synthetic-pipeline` for future live synthetic transaction sources. Each transaction JSON includes root links to card, merchant, device, IP, and category/country cluster entities; context endpoints add related transactions, card timelines, and graph nodes/edges for reviewer highlighting.

## Current Results

Balanced profile on the provided dataset processes all 1,000 rows and flags 80 transactions. The queue is dominated by the discovered fraud families: high-value gift-card/electronics purchases, low-dollar online card testing bursts, and cross-card QuickPay bursts.

## Tests

```bash
.venv/bin/python -m pytest mimir/src/mimir-fraud/tests
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
