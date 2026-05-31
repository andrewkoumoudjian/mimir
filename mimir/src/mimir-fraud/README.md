# mimir-fraud

Valsoft-first fraud/risk engine for Mimir.

Run from the repository root:

```bash
/Users/andrewkoumoudjian/.local/bin/uv venv --python 3.12 .venv
/Users/andrewkoumoudjian/.local/bin/uv pip install --python .venv/bin/python "maturin>=1.7,<2"
env PATH="$HOME/.local/bin:$PATH" .venv/bin/maturin develop --uv --manifest-path mimir/packages/mimir-core/Cargo.toml
env PATH="$HOME/.local/bin:$PATH" .venv/bin/maturin develop --uv --manifest-path mimir/packages/xfraud-ml/Cargo.toml
env PATH="$HOME/.local/bin:$PATH" .venv/bin/maturin develop --uv --manifest-path mimir/packages/synthetic-pipeline/Cargo.toml
/Users/andrewkoumoudjian/.local/bin/uv pip install --python .venv/bin/python -e mimir/src/mimir-fraud

.venv/bin/python -m mimir.cli score \
  --input valsoft/data/transactions.csv \
  --output-dir valsoft/output \
  --profile balanced
```

Useful commands:

```bash
.venv/bin/python -m mimir.cli next --status pending
.venv/bin/python -m mimir.cli context tx_000985
.venv/bin/python -m mimir.cli review tx_000985 --action escalate
.venv/bin/python -m mimir.cli undo
.venv/bin/python -m mimir.cli serve --port 8787
```

The Python package import is `mimir.*`. The active challenge package lives under `mimir/src` while Rust-backed primitive packages stay under `mimir/packages`.

The graph/cross-card feature path uses `mimir_core.TransactionProcessor`. The xFraud graph scoring path uses `xfraud_ml` to train from documented pseudo-labels and produce `xfraud_graph_score`, model metrics, and reason evidence. The run summary also probes `synthetic_pipeline.TransactionProfile` so the detector is ready for a live synthetic transaction source.

Context API endpoints include `/transactions/{id}/context`, `/entities/{type}/{id}`, `/cards/{card_id}/timeline`, and `/graph?transaction_id=...`.
