# mimir-fraud

Valsoft-first fraud/risk engine for Mimir.

Run from the repository root:

```bash
PYTHONPATH=mimir/packages/mimir-fraud/src \
  python3 -m mimir.cli score \
  --input valsoft/data/transactions.csv \
  --output-dir valsoft/output \
  --profile balanced
```

Useful commands:

```bash
PYTHONPATH=mimir/packages/mimir-fraud/src python3 -m mimir.cli queue
PYTHONPATH=mimir/packages/mimir-fraud/src python3 -m mimir.cli review tx_000985 --action escalate
PYTHONPATH=mimir/packages/mimir-fraud/src python3 -m mimir.cli undo
PYTHONPATH=mimir/packages/mimir-fraud/src python3 -m mimir.cli serve --port 8787
```

The Python package import is `mimir.*`. The active challenge package lives here because the repository already has
`mimir/packages` placeholders for shared primitives and future Brim layers.
