Here are the formulas currently used in code.

Notation from [normalize.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/scoring/normalize.py:12):

```text
clip01(x) = min(max(x, 0), 1)

scale_above(x, start, full) =
  clip01((x - start) / (full - start))

weighted_mean(parts) =
  clip01(sum(clip01(value_i) * weight_i) / sum(weight_i))

robust_z(x) =
  (x - median) / (1.4826 * MAD + epsilon)
```

**Final Score**

From [score_engine.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/scoring/score_engine.py:113):

```text
raw =
  0.30 * card_baseline
+ 0.25 * graph_collective
+ 0.20 * temporal_velocity
+ 0.15 * categorical_surprisal
+ 0.10 * model_consensus

risk_score = clip01(raw / 0.55)
```

Risk level:

```text
critical >= 0.82
high     >= 0.66
medium   >= 0.42
low       < 0.42
```

**Card Baseline**

Feature formulas from [card_baselines.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/features/card_baselines.py:15):

```text
amount_ratio = amount / (card_median_amount + epsilon)

robust_z_log_amount =
  (log1p(amount) - median(log1p(card_amounts)))
  / (1.4826 * MAD(log1p(card_amounts)) + epsilon)
```

Component score:

```text
card_baseline = weighted_mean([
  scale_above(abs(robust_z_log_amount), 2.5, 9.0)       * 1.4,
  scale_above(amount_ratio, 3.0, 14.0)                  * 1.5,
  I(category_is_new_for_card)                           * 1.0,
  I(merchant_is_new_for_card)                           * 0.7,
  I(device_is_new_for_card)                             * 1.1,
  I(ip_is_new_for_card)                                 * 0.6,
  I(channel_is_unusual_for_card)                        * 0.8,
  I(merchant_country_is_unusual_for_card)               * 0.8,
  I(country_mismatch)                                   * 0.5,
  I(category in {gift_card,electronics,travel}
    and amount >= 300)                                  * 1.4
])
```

Novelty rules:

```text
category/merchant/device/ip new = prior_card_tx_count >= 3 and unseen before
unusual channel/country = prior_card_tx_count >= 8 and historical frequency <= 10%
```

**Categorical Surprisal**

From [categorical_surprisal.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/features/categorical_surprisal.py:22):

```text
surprisal(value | card) =
  -ln((count(card, value) + 1) / (card_total + 1 * cardinality))
```

Component score:

```text
categorical_surprisal = weighted_mean([
  scale_above(merchant_category_card_surprisal, 1.1, 3.0)          * 1.1,
  scale_above(merchant_name_card_surprisal, 1.4, 3.2)              * 1.0,
  scale_above(device_id_card_surprisal, 1.0, 2.8)                  * 0.7,
  scale_above(ip_address_card_surprisal, 1.0, 2.8)                 * 0.6,
  scale_above(category_channel_country_combo_surprisal, 1.2, 3.1)  * 1.2,
  scale_above(categorical_surprisal_raw, 1.2, 2.8)                 * 1.0
])
```

**Temporal Velocity**

From [temporal_velocity.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/features/temporal_velocity.py:23):

```text
temporal_velocity = weighted_mean([
  scale_above(card_tx_count_10m, 2, 7)                    * 1.2,
  scale_above(card_tx_count_60m, 3, 11)                   * 1.3,
  scale_above(card_online_tx_count_60m, 2, 9)             * 1.2,
  scale_above(card_small_tx_count_60m, 2, 9)              * 1.4,
  scale_above(merchant_unique_cards_60m, 3, 8)            * 1.0,
  scale_above(merchant_tx_count_60m, 3, 12)               * 0.8,
  scale_above(same_card_same_merchant_count_60m, 2, 5)    * 0.8,
  I(same_card_same_amount_near_duplicate_24h)             * 0.8,
  I(split_purchase_suspect)                               * 1.0,
  scale_above(card_high_risk_tx_count_24h, 1, 4)          * 1.2,
  scale_above(card_high_amount_tx_count_24h, 1, 4)        * 1.2,
  scale_above(same_card_same_device_count_24h, 1, 4)      * 0.7
])
```

Card testing floor:

```text
if channel == online
and amount <= 25
and card_small_tx_count_60m >= 6
and card_online_tx_count_60m >= 6:

  temporal_velocity = max(temporal_velocity, 0.95)
```

**Graph Collective**

From Rust [stream.rs](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/packages/mimir-core/src/stream.rs:97) and scoring in [score_engine.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/scoring/score_engine.py:87):

```text
merchant_burst_score =
  clip01(((merchant_unique_cards_60m - 2) / 6)
       + ((merchant_tx_count_60m - 3) / 18))

unusual_merchant_hit_by_many_cards =
  merchant_unique_cards_60m >= 5 and merchant_tx_count_60m >= 5

shared_device_with_other_cards =
  device_unique_cards_total > 1

shared_ip_with_other_cards =
  ip_unique_cards_total > 1

merchant_category_country_cluster_rarity =
  cluster_count <= 4
```

Component score:

```text
graph_collective = weighted_mean([
  merchant_burst_score                                      * 1.4,
  I(unusual_merchant_hit_by_many_cards)                     * 1.4,
  scale_above(merchant_unique_cards_24h, 6, 18)             * 0.7,
  I(shared_device_with_other_cards)                         * 1.2,
  I(shared_ip_with_other_cards)                             * 0.7,
  scale_above(device_unique_cards_total, 1, 4)              * 0.8,
  scale_above(ip_unique_cards_total, 1, 4)                  * 0.7,
  scale_above(ip_prefix_unique_cards_60m, 4, 10)            * 0.8,
  I(cluster_rarity and high_risk_category)                  * 0.9,
  xfraud_graph_score                                        * 1.6
])
```

**Model Consensus**

From [model_consensus.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/features/model_consensus.py:30):

```text
scaled_features = RobustScaler(numeric_features)
isolation_score = -IsolationForest.score_samples(scaled_features)
model_consensus_score = percentile_rank(isolation_score)
```

Where:

```text
percentile_rank = rank / (n - 1)
```

**xFraud Score**

From [xfraud_graph.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/features/xfraud_graph.py:42):

```text
xfraud_graph_score =
  clip01(0.78 * rust_model_probability + 0.22 * heuristic_prior_score)
```

If Rust training is unavailable or lacks enough labels, it falls back to `heuristic_prior_score`.

Pseudo-label positive criteria include:

```text
review status in {declined, blocked}
or review status == escalated
or card_testing rule true
or high_risk_category and amount >= 300
or unusual_merchant_hit_by_many_cards
or shared_device_with_other_cards and device_unique_cards_total >= 4
```

Pseudo-label negative criteria:

```text
category not high risk
and amount <= 180
and abs(robust_z_log_amount) < 1.5
and amount_ratio < 2.2
and card_tx_count_60m <= 2
and merchant_unique_cards_60m <= 2
and no new category/device/IP
and no country mismatch
and no shared device
```

**Primary Pattern Mapping**

From [reason_engine.py](/Users/andrewkoumoudjian/Desktop/Analytics/mimir/mimir/src/mimir-fraud/src/mimir/scoring/reason_engine.py:330):

```text
CARD_TESTING_VELOCITY                      -> card_testing
MERCHANT_BURST                             -> merchant_burst
HIGH_RISK_CATEGORY_AMOUNT
or REPEATED_HIGH_RISK_CARD_ACTIVITY        -> account_takeover_purchase
SHARED_DEVICE_ACROSS_CARDS
or SHARED_IP_ACROSS_CARDS                  -> shared_instrument
XFRAUD_GRAPH_SCORE                         -> xfraud_graph_anomaly
AMOUNT_SPIKE_FOR_CARD                      -> card_baseline_anomaly
model_consensus_score >= 0.90              -> model_consensus
otherwise                                  -> elevated_risk
```

Important nuance: mapping is ordered. If a transaction has both `CARD_TESTING_VELOCITY` and `XFRAUD_GRAPH_SCORE`, the primary pattern is still `card_testing`.
