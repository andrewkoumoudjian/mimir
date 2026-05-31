# mimir-fraud

`mimir-fraud` is the Python package for the Valsoft Fraud Hunter challenge. It owns CSV ingestion, feature engineering, scoring, explanation generation, review state, exports, CLI commands, and the local reviewer API.

---

## Role in the challenge

This package satisfies the backend requirements:

- Load and validate `valsoft/data/transactions.csv`
- Process all 1,000 transactions
- Produce a risk score, risk level, primary pattern, xFraud graph score, and reasons for every transaction
- Export an updated CSV with Mimir risk columns
- Export JSON files for the dashboard and demo
- Support reviewer decisions and undo
- Serve local API endpoints consumed by `mimir/apps/dashboard`

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

## Commands

```bash
.venv/bin/python -m mimir.cli score \
  --input valsoft/data/transactions.csv \
  --output-dir valsoft/output \
  --profile balanced

.venv/bin/python -m mimir.cli queue --status pending
.venv/bin/python -m mimir.cli next --status pending
.venv/bin/python -m mimir.cli context tx_000985
.venv/bin/python -m mimir.cli review tx_000985 --action escalate
.venv/bin/python -m mimir.cli undo
.venv/bin/python -m mimir.cli serve --port 8787
```

## Package layout

| Path | Responsibility |
| --- | --- |
| `src/mimir/data` | CSV loading and validation |
| `src/mimir/features` | Card baselines, categorical surprisal, temporal velocity, graph/collective signals, xFraud, and model consensus |
| `src/mimir/scoring` | Component scores, risk levels, thresholds, recommended actions, and reason codes |
| `src/mimir/context` | Transaction, entity, timeline, and graph context |
| `src/mimir/review` | Review state, undo, audit log, feedback, and training status |
| `src/mimir/export` | Updated CSV and JSON artifact writers |
| `src/mimir/api` | Local HTTP API |
| `src/mimir/cli.py` | Command line interface |
| `tests` | Detector and review-state tests |

## Detection logic

The scoring engine combines:

- Per-card baselines for amount, category, merchant, device, IP, channel, and country behavior
- Categorical surprisal for card-conditioned rarity
- Temporal velocity windows for card testing and burst behavior
- Graph and collective features for merchant, device, IP, and IP-prefix reuse across cards
- Rust-backed xFraud graph score with explicit pseudo-label policy
- IsolationForest consensus as secondary evidence only

Reasons are deterministic and evidence-backed so the reviewer sees why a transaction was flagged, not just that it was flagged.

## Outputs

`score` writes:

- `valsoft/output/transactions_with_mimir_risk.csv`
- `valsoft/output/risk_results.json`
- `valsoft/output/review_queue.json`

Review commands also create or update:

- `valsoft/output/review_state.json`
- `valsoft/output/audit_log.jsonl`

## Tests

```bash
.venv/bin/python -m pytest mimir/src/mimir-fraud/tests
```

The tests cover a known high-risk gift-card flag, a known low-risk restaurant row, xFraud/context availability, review action persistence, audit labels, training status, and undo.

## Related docs

- [Challenge README](../../README.md)
- [Valsoft PRD](../../docs/VALSOFT_PRD.md)
- [Implementation plan](../../docs/IMPLEMENTATION_PLAN.md)
- [Hypothesis log](../../docs/HYPOTHESIS_LOG.md)
