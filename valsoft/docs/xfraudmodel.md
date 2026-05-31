I checked the current `valsoft/output/risk_results.json` and recomputed the graph breakdown without rewriting outputs.

**xFraud Status**
`xfraud-ml` is active: no fallback was used.

**Graph Shape**

| Stat | Value |
| --- | ---: |
| Total nodes | 1,615 |
| Total edge tuples | 3,874 |
| Edge types | 5 |
| Feature vectors | 1,615 |
| Base feature dimension | 14 |
| Training seeds | 453 |

Node types:

```text
transaction: 1000
ip: 395
device: 96
card: 50
merchant: 41
category_country_cluster: 33
```

Edge types:

```text
uses_card: 1000
paid_merchant: 1000
in_category_country_cluster: 1000
used_device: 437
used_ip: 437
```

**Pseudo-Labels**

```text
positive: 54
negative: 399
total: 453
```

Sources:

```text
heuristic_stable_low_anomaly: 397
heuristic_card_testing_velocity: 39
heuristic_high_risk_category_amount: 13
heuristic_merchant_burst: 1
reviewer_escalated_weak: 1
reviewer_approved: 1
reviewer_dismissed: 1
```

**Train / Valid / Test Split**

```text
train: 326 total, 46 positive, 280 negative
valid: 82 total, 8 positive, 74 negative
test: 45 total, 0 positive, 45 negative
```

**Model Metrics**

| Split | Loss | Accuracy | AUC | AP | Count |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 0.4464 | 0.9417 | 0.9930 | 0.8890 | 326 |
| Valid | 0.4060 | 1.0000 | 1.0000 | 1.0000 | 82 |
| Test | 0.4559 | 0.9778 | 0.5000 | 0.0000 | 45 |

It trained for `5` epochs. The reported model feature dimension is `31` because `sage-mean` expands the 14 base features into:

```text
14 transaction features
+ 14 sampled neighborhood mean features
+ 3 graph context stats
= 31 model features
```

Main caveat: the test split has zero positive pseudo-labels, so `test AUC = 0.5` and `AP = 0.0` are not very informative. The validation metrics look perfect, but these are pseudo-label metrics, not true ground-truth fraud metrics.
