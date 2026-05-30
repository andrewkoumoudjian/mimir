# mimir-fraud

Valsoft-first fraud/risk engine for Mimir.

Run from the repository root:

```bash
python3.12 -m pip install -q maturin
python3.12 -m pip install -e mimir/packages/mimir-core
python3.12 -m pip install -e mimir/packages/xfraud-ml
python3.12 -m pip install -e mimir/packages/synthetic-pipeline

PYTHONPATH=mimir/src/mimir-fraud/src \
  python3.12 -m mimir.cli score \
  --input valsoft/data/transactions.csv \
  --output-dir valsoft/output \
  --profile balanced
```

Useful commands:

```bash
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m mimir.cli queue
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m mimir.cli review tx_000985 --action escalate
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m mimir.cli undo
PYTHONPATH=mimir/src/mimir-fraud/src python3.12 -m mimir.cli serve --port 8787
```

The Python package import is `mimir.*`. The active challenge package lives under `mimir/src` while Rust-backed primitive packages stay under `mimir/packages`.

The graph/cross-card feature path uses `mimir_core.TransactionProcessor`. The run summary also probes `xfraud_ml.XFraudTrainingData` and `synthetic_pipeline.TransactionProfile` so the detector is ready for a live synthetic transaction source.
