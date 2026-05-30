# xfraud-ml

Pure-Rust xFraud-style ML and training stack for Mimir.

This package ports the reusable training shape from `ref/xFraud-master/xfraud/run_detector.py` without requiring PyTorch, CUDA, PyG, or LevelDB:

- heterogeneous transaction graph encoding from xFraud edge tuples;
- GraphSAGE-style neighborhood sampling with optional degree/type weighting;
- feature lookup from Python dictionaries;
- time-ordered train/validation/test splits;
- balanced mini-batch binary detector training;
- cosine learning-rate decay, validation AUC early stopping, AUC/AP/loss/accuracy metrics;
- Python bindings through `maturin`.

The first Rust model is intentionally CPU-first and dependency-light: `conv_name="logi"` trains on node features only, while `conv_name="sage-mean"` augments each seed with sampled neighborhood mean features and compact graph statistics. This preserves the xFraud training workflow while keeping the crate buildable on a stock Rust toolchain.

Build locally:

```bash
cd mimir/packages/xfraud-ml
python3 -m pip install -e ".[dev]"
```

Run Rust tests:

```bash
cargo test
```

Example Python use:

```python
from xfraud_ml import TrainingConfig, XFraudTrainer, XFraudTrainingData

data = XFraudTrainingData.from_edge_tuples(edge_tuples, features)
config = TrainingConfig(width=8, depth=2, max_epochs=25, conv_name="sage-mean")
model = XFraudTrainer.from_config(config).train(data)

print(model.metrics())
print(model.predict_proba(data)[:5])
```

