# mimir-core

Rust-backed Python primitives for Mimir's continuous transaction intelligence pipeline.

This package ports the reusable xFraud primitives into Rust through `maturin`:

- heterogeneous graph construction and budget-based sampling;
- encoded graph primitives for GraphSAGE-style neighbor expansion;
- feature vector storage;
- edge explanation utilities, top-k hit-rate scoring, and centrality baselines;
- a stateful transaction processor for streaming graph/collective features.

Build locally:

```bash
cd mimir/packages/mimir-core
python3 -m pip install -e ".[dev]"
```

Run Rust tests:

```bash
cargo test
```
