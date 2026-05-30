Yes. For this challenge, the “frontier” answer is **not** “train one unsupervised model and hope.” The best academic framing is:

> **Unsupervised fraud detection as layered anomaly evidence:** contextual per-card deviation + rare categorical combinations + temporal burst detection + graph/collective anomaly detection + calibrated review thresholds.

That directly matches the Valsoft brief: the tool must find fraud without labels, explain every flag, build per-card baselines, include cross-card aggregation, and support a human reviewer rather than just outputting a table.  

## The strongest techniques to use

| Priority | Technique / theory                                   | Why it fits this dataset                                                                                                                                                                                                                                                                                                           | Build or stretch?                                 |
| -------: | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
|        1 | **Robust per-card behavioral anomaly scoring**       | The brief explicitly rewards per-card baselines: amount, category, merchant, device, country, channel. Robust statistics is ideal because fraud itself contaminates the baseline; robust methods fit the majority first, then flag deviations. ([arXiv][1])                                                                        | **Build now**                                     |
|        2 | **Graph / collective anomaly detection**             | The brief says one fraud pattern is invisible without cross-card aggregation. Model transactions as a heterogeneous graph: `card ↔ merchant ↔ device ↔ IP ↔ country`. Modern fraud research strongly emphasizes graph methods because fraud is relational, clustered, and often only obvious through shared entities. ([arXiv][2]) | **Build graph features now; full GNN as stretch** |
|        3 | **Temporal burst / changepoint detection**           | Fraud often appears as bursts: many cards hitting one merchant, rapid small card-testing charges, or a sudden change in a card’s behavior. Bayesian online changepoint detection formalizes this as abrupt shifts in a sequence’s generative process. ([arXiv][3])                                                                 | **Build simple windows now**                      |
|        4 | **Categorical surprisal / rare-combination scoring** | Your columns are mostly categorical: merchant, category, channel, device, IP, cardholder country, merchant country. Mixed-data anomaly literature says embedding/scoring mixed continuous + categorical data improves anomaly separation. ([arXiv][4])                                                                             | **Build now**                                     |
|        5 | **Isolation Forest / LOF / kNN ensemble**            | Useful as a baseline, especially for global/local numeric outliers. Isolation Forest isolates anomalies through random partition trees and outputs anomaly scores; LOF scores local outlierness relative to nearby density.                                                                                                        | **Build as secondary score**                      |
|        6 | **ECOD / COPOD / empirical tail probability**        | These are very relevant because they are interpretable, parameter-light, and based on tail probabilities. ECOD uses empirical CDFs to estimate per-dimension tail probability; COPOD uses empirical copulas to model multivariate extremeness. ([arXiv][5])                                                                        | **Build if time allows**                          |
|        7 | **Conformal anomaly calibration / FDR control**      | This is excellent for the cost-aware slider. Most anomaly detectors output scores, but conformal methods turn scores into calibrated p-values and can support false discovery control. ([arXiv][6])                                                                                                                                | **Stretch / impressive README section**           |
|        8 | **Self-supervised contrastive fraud detection**      | Recent work applies SimCLR-style contrastive learning for unlabeled e-commerce fraud and reports better results than traditional unsupervised baselines. But with only 1,000 transactions, this is probably overkill unless used only as a “future work” direction. ([arXiv][7])                                                   | **Do not build now**                              |

## The winning conceptual model

Frame Mimir’s Valsoft detector as a **multi-theory anomaly engine**, not as a single model:

```text
Mimir Fraud Score =
  robust card-behavior anomaly
+ categorical surprisal
+ graph/collective anomaly
+ temporal burst anomaly
+ global outlier model consensus
+ reviewer feedback adjustment
```

This gives you both **academic depth** and **demo clarity**.

The broader anomaly-detection literature supports this kind of ensemble thinking because unsupervised anomaly detection has no single universally best model. ADBench compared 30 algorithms on 57 datasets and was designed precisely because method choice depends on supervision level, anomaly type, and noise. ([arXiv][8]) A 2024 JMLR benchmark similarly found that different algorithms suit different anomaly types: kNN-style methods work well for local anomalies, Extended Isolation Forest for global anomalies, and unsupervised anomaly detection is best understood as a ranking problem rather than a clean classification problem. 

## What I would actually implement for the hackathon

### 1. Robust per-card baseline score

Use this as the core. For each `card_id`, compute:

```text
amount_ratio_to_card_median
log_amount_mad_z
category_surprise_for_card
merchant_surprise_for_card
channel_surprise_for_card
country_pair_surprise_for_card
new_device_for_card
new_ip_for_card
new_merchant_for_card
```

Use robust formulas:

```text
ROBUST_Z_AMOUNT =
  (log1p(amount) - median_card_log_amount)
  / (1.4826 * MAD_card_log_amount + epsilon)
```

Then create reason strings like:

```text
"Amount is 18.4x this card's median transaction."
"First time this card used this device."
"Merchant country is unusual for this card."
"Category 'gift_card' has never appeared for this card."
```

This directly satisfies the brief’s “explainable score” requirement.

### 2. Categorical surprisal score

For every categorical feature, compute smoothed rarity:

```text
SURPRISE(category | card) =
  -log((count(card, category) + alpha) / (count(card) + alpha * K))
```

Do this for:

```text
merchant_category
merchant_name
merchant_country
channel
device_id
ip_address
merchant_country != cardholder_country
```

This is powerful because it catches fraud that is not simply “large amount.” A $20 transaction can be suspicious if it is the tenth tiny online payment from a new device in five minutes.

### 3. Graph anomaly layer

Do not train a GNN in 24 hours. Use the **graph theory** without the deep model.

Build a heterogeneous graph:

```text
card_id --transaction--> merchant_name
card_id --transaction--> device_id
card_id --transaction--> ip_address
card_id --transaction--> merchant_country
device_id --seen_with--> card_id
ip_address --seen_with--> card_id
merchant_name --hit_by--> card_id
```

Then compute simple graph features:

```text
device_unique_cards
ip_unique_cards
merchant_unique_cards_1h
merchant_unique_cards_24h
merchant_amount_sum_1h
merchant_burst_z
card_new_connected_components
card_device_ip_novelty
```

This is where you win the “one pattern invisible without cross-card aggregation” part. Full GNNs are academically impressive because they capture relational patterns and dynamics in financial networks, but for this tiny dataset, graph-derived features are more explainable and more reliable. ([arXiv][2])

Reason examples:

```text
"Merchant burst: 8 different cards used QuickPay Online within 90 minutes."
"Device/IP cluster is new for this card."
"Merchant has an abnormal same-day volume spike across cards."
```

### 4. Temporal burst layer

Use sliding windows, not a heavy time-series model.

Compute:

```text
card_tx_count_10m
card_tx_count_60m
card_online_tx_count_60m
card_small_tx_count_60m
merchant_tx_count_60m
merchant_unique_cards_60m
device_tx_count_60m
ip_tx_count_60m
same_card_same_device_velocity
```

This catches:

```text
card testing: many small online purchases quickly
merchant attack: many cards hit same merchant in short period
account takeover: sudden new-device spending burst
cashout: gift cards/electronics cluster after normal behavior
```

The research version of this is changepoint detection: infer whether a sequence has abruptly changed its generating behavior. For this challenge, simple windowed velocity is enough and much easier to explain. ([arXiv][3])

### 5. Isolation Forest / LOF / ECOD as model consensus

After hand-engineering features, run a small unsupervised ensemble:

```text
IsolationForest
LocalOutlierFactor
ECOD or COPOD
kNN distance score
```

But do **not** let these models be the main explanation. Use them as one component:

```text
"Global anomaly model consensus: 3 of 4 unsupervised detectors ranked this in the top 5%."
```

Isolation Forest and LOF are strong baseline methods, but the literature and benchmarks are clear that unsupervised models are assumption-sensitive; use them to support your domain evidence, not replace it. 

## The “frontier” technique judges will respect most

The strongest answer is:

> **Heterogeneous graph anomaly detection with explainable local reason codes.**

Why: it hits the hardest part of the brief. Per-card baselines are expected. A graph layer is what separates a serious fraud system from a simple anomaly table.

Your pitch:

```text
Mimir does not only ask: "Is this transaction weird for this card?"

It also asks:
"Is this transaction part of a wider suspicious structure?"

For example:
- many cards hitting one merchant in a short window
- one device/IP appearing across suspicious transactions
- one merchant-category-country combination appearing unusually often
- a card suddenly moving into a new graph neighborhood
```

This aligns with graph-fraud literature, including xFraud, which uses heterogeneous transaction graphs and produces human-understandable graph explanations. ([arXiv][9]) It also aligns with recent financial transaction-flow research, where network analysis is emphasized because fraud patterns evolve, labels are scarce, and interpretability is crucial for investigators. ([arXiv][10])

## Recommended scoring architecture

Use a transparent weighted score:

```text
FINAL_SCORE =
  0.30 * CARD_BASELINE_SCORE
+ 0.25 * GRAPH_COLLECTIVE_SCORE
+ 0.20 * TEMPORAL_BURST_SCORE
+ 0.15 * CATEGORICAL_SURPRISE_SCORE
+ 0.10 * MODEL_CONSENSUS_SCORE
```

Then expose a cost-aware threshold:

```text
Review threshold = quantile(FINAL_SCORE, 1 - target_review_rate)
```

For the slider:

```text
Low false-positive tolerance  -> review top 3-5%
Balanced                      -> review top 7-10%
High recall / aggressive      -> review top 12-15%
```

Since the brief says fraud is around 7%, a default review queue around **8–10%** is defensible: it gives you room to catch most fraud without flooding the reviewer. 

## What to avoid

Avoid making the core detector a neural autoencoder, transformer, or full GNN. Those are legitimate research directions, but with 1,000 rows and 50 cards, they are harder to tune, harder to explain, and easier to overfit. The JMLR benchmark explicitly notes that neural methods lack general construction guidelines for arbitrary unsupervised tabular datasets and that their feature-extraction strength is less useful on smaller tabular datasets. 

Also avoid a pure “black-box anomaly score.” The brief judges explanations and reviewer experience almost as much as detection quality. The best implementation is an **evidence ledger**:

```json
{
  "transaction_id": "tx_001003",
  "score": 0.94,
  "risk_level": "high",
  "primary_pattern": "merchant_burst",
  "reasons": [
    "QuickPay Online saw 8 cards in a short window",
    "amount is 46.2x this card's median",
    "new device for this card",
    "online merchant country differs from cardholder's usual geography"
  ],
  "review_action": null
}
```

## Final stack I would use

For your hackathon project, the best “research-backed but shippable” stack is:

```text
Core theory:
- Robust statistics / MAD
- Categorical surprisal
- Graph anomaly features
- Temporal burst / velocity detection
- IsolationForest + LOF + ECOD/COPOD model consensus
- Optional conformal p-value calibration

Implementation:
- Python
- Polars for feature engineering
- scikit-learn for IsolationForest / LOF
- PyOD for ECOD/COPOD/HBOS if time allows
- NetworkX only if needed, otherwise Polars group-bys are enough
- JSON reason objects for frontend rendering
```

The winning framing:

> **Mimir is a human-centered unsupervised fraud investigation engine. It does not merely flag outliers; it explains which behavioral, temporal, and network assumptions were violated.**

[1]: https://arxiv.org/abs/1707.09752 "[1707.09752] Anomaly Detection by Robust Statistics"
[2]: https://arxiv.org/abs/2411.05815 "[2411.05815] Graph Neural Networks for Financial Fraud Detection: A Review"
[3]: https://arxiv.org/abs/0710.3742 "[0710.3742] Bayesian Online Changepoint Detection"
[4]: https://arxiv.org/abs/2005.12129 "[2005.12129] Factor Analysis of Mixed Data for Anomaly Detection"
[5]: https://arxiv.org/abs/2201.00382?utm_source=chatgpt.com "ECOD: Unsupervised Outlier Detection Using Empirical Cumulative Distribution Functions"
[6]: https://arxiv.org/abs/2605.13642 "[2605.13642] Conformal Anomaly Detection in Python: Moving Beyond Heuristic Thresholds with 'nonconform'"
[7]: https://arxiv.org/abs/2503.18841 "[2503.18841] Unsupervised Detection of Fraudulent Transactions in E-commerce Using Contrastive Learning"
[8]: https://arxiv.org/abs/2206.09426 "[2206.09426] ADBench: Anomaly Detection Benchmark"
[9]: https://arxiv.org/abs/2011.12193 "[2011.12193] xFraud: Explainable Fraud Transaction Detection"
[10]: https://arxiv.org/abs/2503.15896 "[2503.15896] FlowSeries: Anomaly Detection in Financial Transaction Flows"
