# Mimir Valsoft Fraud Engine

Mimir is the Valsoft Fraud Hunter implementation for a broader transaction intelligence platform. It ingests the challenge CSV, scores all 1,000 rows, explains every flag, exports an updated CSV, and gives a reviewer a real triage path through approve, dismiss, escalate, and undo.

---

## Challenge requirements

| Requirement | Mimir answer |
| --- | --- |
| Ingest `transactions.csv` | `mimir.cli score` loads and validates all 1,000 rows from `valsoft/data/transactions.csv` |
| Flag suspicious transactions | Balanced mode flags the top 8% review queue, currently 80 transactions |
| Explain every flag | Each `TransactionRisk` includes up to five ordered reasons with exact evidence |
| Support a reviewer | CLI and dashboard support queue navigation, approve, dismiss, escalate, and undo |
| Updated transaction file | `valsoft/output/transactions_with_mimir_risk.csv` appends risk, flag, pattern, reason, xFraud, and review columns |
| README | This file explains setup, run path, detection strategy, outputs, tests, and next work |
| PRD | [VALSOFT_PRD.md](docs/VALSOFT_PRD.md) defines user, problem, success, and non-goals |
| Implementation plan | [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) defines architecture, tech choices, and skipped work |
| Bonus hypothesis log | [HYPOTHESIS_LOG.md](docs/HYPOTHESIS_LOG.md) records the fraud hypotheses and decisions |

## Setup

Run from the repository root:

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

Current balanced run:

| Metric | Value |
| --- | ---: |
| Processed rows | 1,000 |
| Flagged rows | 80 |
| Review rate | 8% |
| Threshold | 0.4928 |
| Critical rows | 7 |
| High rows | 32 |
| Medium rows | 77 |
| Low rows | 884 |

Primary flagged patterns in the current run:

| Pattern | Flags |
| --- | ---: |
| Card testing | 39 |
| Account takeover purchase | 16 |
| Card baseline anomaly | 12 |
| Elevated risk | 10 |
| xFraud graph anomaly | 2 |
| Merchant burst | 1 |

## Output artifacts

The scoring command writes:

- `valsoft/output/transactions_with_mimir_risk.csv`
- `valsoft/output/risk_results.json`
- `valsoft/output/review_queue.json`
- `valsoft/output/review_state.json` after reviewer actions
- `valsoft/output/audit_log.jsonl` after reviewer actions

The updated CSV keeps the original rows and appends:

- `mimir_risk_score`
- `mimir_risk_level`
- `mimir_is_flagged`
- `mimir_xfraud_graph_score`
- `mimir_recommended_action`
- `mimir_primary_pattern`
- `mimir_reason_codes`
- `mimir_review_status`

## Reviewer workflow

CLI commands emit JSON for repeatable review and agent use:

```bash
.venv/bin/python -m mimir.cli queue --status pending
.venv/bin/python -m mimir.cli next --status pending
.venv/bin/python -m mimir.cli context tx_000985
.venv/bin/python -m mimir.cli review tx_000985 --action escalate --note "Gift-card cashout"
.venv/bin/python -m mimir.cli undo
```

Reviewer decisions default to `agent_reviewer`, update `review_state.json`, and append receipts to `audit_log.jsonl`. Dismissals also feed session feedback so similar pending flags can be suppressed in the same run.

## Local API

Start the API:

```bash
.venv/bin/python -m mimir.cli serve --port 8787
```

Available endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /summary` | Run summary, threshold, risk counts, primitive status, and output files |
| `GET /queue` | Flagged pending review queue |
| `GET /transactions` | All scored transactions |
| `GET /transactions/{id}/context` | Transaction, links, related rows, timeline, and graph context |
| `GET /entities/{type}/{id}` | Card, merchant, device, IP, or category-country entity context |
| `GET /cards/{card_id}/timeline` | Per-card transaction timeline |
| `GET /graph?transaction_id=...` | Graph nodes and edges around a transaction |
| `GET /audit` | Review audit events |
| `POST /review` | Apply reviewer action |
| `POST /undo` | Undo last reviewer action |

## Dashboard

Start the API first, then run the dashboard from the Bun workspace:

```bash
cd mimir
bun run dev:dashboard
```

Open `http://127.0.0.1:3001`. The dashboard uses `NEXT_PUBLIC_MIMIR_API_URL` or `MIMIR_API_URL` when set, otherwise `http://127.0.0.1:8787`.

The dashboard includes:

- A strict review queue sorted by risk
- Keyboard navigation with arrow keys
- Keyboard review actions: `A` approve, `D` dismiss, `E` escalate, `U` undo
- Evidence, score, pattern, component scores, and xFraud score
- Search and filters for investigation outside the strict queue
- Audit feed and reviewer status
- Context views for cards, merchants, categories, and related transactions

## Detection strategy

Mimir is a layered, explainable anomaly engine:

| Layer | Logic | Why it matters |
| --- | --- | --- |
| Per-card baseline | Robust log amount z-score, amount-to-card-median ratio, new category, merchant, device, IP, channel, and country | Finds account takeover and behavior shifts that absolute thresholds miss |
| Categorical surprisal | Smoothed negative log probability for card-conditioned merchant, category, channel, country, device, and IP behavior | Converts "rare for this card" into a comparable signal |
| Temporal velocity | 10-minute, 60-minute, and 24-hour windows for card testing, repeated high-risk purchases, near duplicates, split purchases, and merchant bursts | Catches bursts that individual transactions hide |
| Graph and collective signals | Merchant unique-card windows, shared device/IP, IP-prefix reuse, and rare category-country clusters | Finds cross-card fraud families that per-card scoring cannot see |
| xFraud graph score | Rust-backed graph model over transaction-card-merchant-device-IP-cluster edges with documented pseudo-labels | Adds graph evidence without hiding label assumptions |
| Model consensus | Deterministic IsolationForest percentile | Secondary evidence only, never the only explanation |

The final score blends component scores with weights from `mimir.core.constants`, calibrates the result to a 0-1 reviewer scale, and then thresholds by profile or cost. Balanced mode uses an 8% review rate; conservative and aggressive modes shrink or expand the queue. Cost-aware runs use `--false-positive-cost` and `--false-negative-cost`.

Reasons are deterministic and human-readable. Examples include:

- `CARD_TESTING_VELOCITY`
- `MERCHANT_BURST`
- `HIGH_RISK_CATEGORY_AMOUNT`
- `REPEATED_HIGH_RISK_CARD_ACTIVITY`
- `SPLIT_PURCHASE_PATTERN`
- `AMOUNT_SPIKE_FOR_CARD`
- `NEW_DEVICE_FOR_CARD`
- `SHARED_DEVICE_ACROSS_CARDS`
- `SHARED_IP_ACROSS_CARDS`
- `XFRAUD_GRAPH_SCORE`

## Architecture

```mermaid
flowchart TB
    accTitle: Fraud Engine Architecture
    accDescr: The fraud engine loads transactions, builds feature layers, produces risk objects, writes challenge outputs, and serves reviewer workflows through CLI, API, and dashboard surfaces.

    csv([transactions.csv]) --> data[Data loading and validation]
    data --> feature_pipeline[Feature pipeline]
    feature_pipeline --> card_baselines[Per-card baselines]
    feature_pipeline --> temporal[Temporal velocity]
    feature_pipeline --> graph[Graph and collective signals]
    feature_pipeline --> xfraud[xFraud graph scoring]
    card_baselines --> scoring[Score and reasons]
    temporal --> scoring
    graph --> scoring
    xfraud --> scoring
    scoring --> exports[CSV and JSON exports]
    scoring --> review_state[Review state and audit log]
    exports --> api[Local API]
    review_state --> api
    api --> dashboard[Next dashboard]
    api --> cli[CLI review commands]
```

Package responsibilities:

| Path | Responsibility |
| --- | --- |
| `mimir/src/mimir-fraud/src/mimir/data` | CSV loading and validation |
| `mimir/src/mimir-fraud/src/mimir/features` | Feature layers and xFraud score |
| `mimir/src/mimir-fraud/src/mimir/scoring` | Component scores, final risk, thresholding, and reasons |
| `mimir/src/mimir-fraud/src/mimir/context` | Entity, timeline, and graph context contracts |
| `mimir/src/mimir-fraud/src/mimir/review` | Review state, undo, audit log, feedback, and training status |
| `mimir/src/mimir-fraud/src/mimir/export` | Updated CSV and JSON artifact writers |
| `mimir/src/mimir-fraud/src/mimir/api` | Dependency-light local HTTP API |
| `mimir/src/mimir-fraud/src/mimir/cli.py` | Scoring, queue, context, review, undo, and serve commands |
| `mimir/apps/dashboard` | Reviewer dashboard built on the local API |
| `mimir/packages/mimir-core` | Rust-backed streaming transaction and graph primitive |
| `mimir/packages/xfraud-ml` | Rust-backed xFraud-style graph training and scoring |
| `mimir/packages/synthetic-pipeline` | Synthetic transaction profile and future live source |

## Tests

```bash
.venv/bin/python -m pytest mimir/src/mimir-fraud/tests
cd mimir && bun run lint --filter=@midday/dashboard
cd mimir && bun run build:dashboard
```

The Python tests cover a known high-risk gift-card case, a known low-risk restaurant case, xFraud/context availability, review actions, audit events, and undo.

## Another week

With another week, Mimir should:

- Validate thresholds against labeled reviewer outcomes or a revealed answer key
- Persist review state in SQLite or Postgres instead of JSON files
- Add precision/recall dashboards once labels are available
- Add conformal or false-discovery-rate calibration
- Promote the synthetic pipeline into a live transaction feed
- Add multi-reviewer assignment, RBAC, and durable audit receipts
- Generalize the fraud engine into the broader Mimir compliance and reporting platform
