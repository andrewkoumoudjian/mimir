# Hypothesis Log

This log records the fraud theories used to build the Valsoft detector and whether each theory became part of the final Mimir scoring logic.

---

## Summary

| ID | Hypothesis | Decision | Final signal |
| --- | --- | --- | --- |
| H1 | High-value gift cards and electronics are account-takeover cashout | Kept | `HIGH_RISK_CATEGORY_AMOUNT`, `REPEATED_HIGH_RISK_CARD_ACTIVITY`, `AMOUNT_SPIKE_FOR_CARD` |
| H2 | Card testing appears as many tiny online transactions in a short window | Kept | `CARD_TESTING_VELOCITY` |
| H3 | One fraud family requires cross-card aggregation | Kept | `MERCHANT_BURST`, shared device/IP, IP-prefix, xFraud graph score |
| H4 | First-seen category, device, or IP is suspicious by itself | Partially rejected | Novelty retained but dampened unless paired with stronger evidence |
| H5 | IsolationForest should drive the queue | Rejected as primary | Kept as `model_consensus` only |
| H6 | xFraud can strengthen graph evidence without hidden labels | Kept with guardrails | `XFRAUD_GRAPH_SCORE` |
| H7 | Review speed depends on entity context, not only rank | Kept | Context API, timeline, graph, related transactions |

## H1: High-value gift cards and electronics are account-takeover cashout

Decision: kept.

Logic: Fraudsters often convert card access into goods or stored value that can be resold quickly. In the dataset, gift card, electronics, and travel rows become much stronger when they also include amount spikes, new merchant or category behavior, new device/IP behavior, or repeated high-risk activity within 24 hours.

Implemented as:

- `HIGH_RISK_CATEGORY_AMOUNT`
- `REPEATED_HIGH_RISK_CARD_ACTIVITY`
- `AMOUNT_SPIKE_FOR_CARD`
- `NEW_DEVICE_FOR_CARD`
- `NEW_CATEGORY_FOR_CARD`

## H2: Card testing appears as many tiny online transactions in a short window

Decision: kept and promoted.

Logic: A single low-dollar online transaction is often benign. Six or more small online transactions on the same card inside 60 minutes is a different pattern: it looks like credential/card testing before larger abuse.

Implemented as:

- `card_small_tx_count_60m`
- `card_online_tx_count_60m`
- `CARD_TESTING_VELOCITY`
- A temporal score floor when both small-transaction and online velocity are high

## H3: One fraud family requires cross-card aggregation

Decision: kept.

Logic: Some suspicious merchants, devices, IPs, or IP prefixes are only suspicious when viewed across cards. The QuickPay-style burst pattern is weak from any single card's perspective but strong when many cards touch the same merchant inside the same window.

Implemented as:

- `merchant_unique_cards_60m`
- `merchant_tx_count_60m`
- `merchant_burst_score`
- `unusual_merchant_hit_by_many_cards`
- `shared_device_with_other_cards`
- `shared_ip_with_other_cards`
- `ip_prefix_unique_cards_60m`
- xFraud graph edges across transaction, card, merchant, device, IP, and category-country nodes

## H4: First-seen category, device, or IP is suspicious by itself

Decision: partially rejected.

Logic: Novelty is useful, but pure novelty over-flags normal life. Low-value subscriptions and utilities often look new without being fraudulent. Mimir keeps novelty signals but dampens routine low-value subscription and utility rows unless temporal, graph, or amount evidence also exists.

Implemented as:

- `NEW_DEVICE_FOR_CARD`
- `NEW_IP_FOR_CARD`
- `NEW_CATEGORY_FOR_CARD`
- `NEW_MERCHANT_FOR_CARD`
- Contextual score dampening for small benign-looking subscriptions and utilities

## H5: IsolationForest should drive the queue

Decision: rejected as primary evidence.

Logic: IsolationForest is good at finding unusual rows, but its explanations are too vague for this challenge. A reviewer should not be asked to trust "model says 0.91" without concrete evidence.

Implemented as:

- `model_consensus_score` as secondary evidence
- Deterministic reason generation remains the source of reviewer-facing explanations
- `ELEVATED_COMPOSITE_RISK` only appears when multiple weak signals combine

## H6: xFraud can strengthen graph evidence without hidden labels

Decision: kept with guardrails.

Logic: The challenge provides no ground-truth labels, but graph structure still carries signal. Mimir trains the Rust-backed xFraud layer on explicit pseudo-labels and exposes those assumptions in metrics and reason evidence.

Pseudo-label policy:

- Reviewer declined or blocked rows are positive labels.
- Reviewer escalated rows are weak positive labels.
- Reviewer approved or dismissed rows are negative labels.
- Without reviewer feedback, high-confidence deterministic fraud flags become positive labels.
- Stable low-anomaly rows become negative labels.
- Ambiguous rows are excluded from training seeds but still scored.

Implemented as:

- `xfraud_graph_score`
- `XFRAUD_GRAPH_SCORE`
- Training metrics and pseudo-label counts in `risk_results.json`

## H7: Review speed depends on entity context, not only rank

Decision: kept.

Logic: A reviewer can decide faster when a suspicious row is shown with card history, related merchant/device/IP activity, and graph neighborhood. This also helps explain cross-card fraud that a one-row view hides.

Implemented as:

- `GET /transactions/{id}/context`
- `GET /entities/{type}/{id}`
- `GET /cards/{card_id}/timeline`
- `GET /graph?transaction_id=...`
- Dashboard links from review rows into evidence and context views

## Current results

Balanced profile on the current challenge file:

| Metric | Value |
| --- | ---: |
| Processed rows | 1,000 |
| Flagged rows | 80 |
| Review rate | 8% |
| Critical rows | 7 |
| High rows | 32 |
| Medium rows | 77 |
| Low rows | 884 |

Flagged pattern mix:

| Pattern | Flags |
| --- | ---: |
| Card testing | 39 |
| Account takeover purchase | 16 |
| Card baseline anomaly | 12 |
| Elevated risk | 10 |
| xFraud graph anomaly | 2 |
| Merchant burst | 1 |
