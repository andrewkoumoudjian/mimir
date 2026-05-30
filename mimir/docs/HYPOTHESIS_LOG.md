# Hypothesis Log

## H1: High-value gift cards and electronics are account-takeover cashout

Kept. Gift-card/electronics/travel transactions with high amount, new merchant/category/device, and repeated 24-hour activity are strong fraud candidates. This catches Apple Gift Card, Gift Card Mall, Apple Store, Newegg, Best Buy, and Air Canada patterns.

## H2: Card testing appears as many tiny online transactions in a short window

Kept and promoted. The dataset contains dense low-dollar online bursts on a single card/device/IP. Temporal velocity now treats six or more small online transactions in 60 minutes as a high-priority signal.

## H3: One fraud family requires cross-card aggregation

Kept. QuickPay Online bursts are much clearer when viewed as many unique cards hitting the same merchant within 60 minutes. Merchant unique-card windows and merchant burst score are part of the graph/collective layer.

## H4: First-seen category/device/IP is suspicious by itself

Partially rejected. Pure novelty created false positives for low-value subscriptions and utilities. The score now dampens routine small recurring-service novelty unless there is a temporal, graph, or amount signal.

## H5: IsolationForest should drive the queue

Rejected as primary evidence. It is useful as a weak consensus score but creates vague explanations if used alone. The final reasons always come from deterministic features.
