# synthetic-pipeline

Rust-backed synthetic transaction generator for Mimir.

The generator learns an empirical profile from `data/transactions.csv` and samples new transactions from the same observed joint patterns:

- card, merchant, category, channel, cardholder country, and merchant country combinations;
- online device and IP reuse patterns;
- category-sensitive amount jitter;
- inter-arrival time distribution.

Build locally:

```bash
cd mimir/packages/synthetic-pipeline
python3 -m pip install -e ".[dev]"
```

Run Rust tests:

```bash
cargo test
```
