# Valsoft Fraud Hunter PRD

## User

The user is a trust and safety reviewer at a payments company. They need to review a small, high-signal queue rather than scan every transaction.

## Problem

The reviewer has 1,000 card transactions with hidden fraud across multiple behavior patterns. They need the system to rank likely fraud, explain why each item is suspicious, and let them decide quickly whether to approve, dismiss, or escalate.

## Success

- All 1,000 rows are processed reproducibly.
- The default queue catches the major hidden fraud patterns without flooding the reviewer.
- Every flagged transaction has at least one concrete, human-readable reason.
- Every transaction exposes card, merchant, device, IP, and category/country entity context through JSON/API contracts.
- The xFraud layer produces `xfraud_graph_score`, model metrics, and reason evidence seeded from documented pseudo-labels.
- Reviewer decisions are stateful and undoable.
- CSV and JSON outputs are ready for a frontend or judge demo.

## Non-Goals

- No neural network or full GNN in the 24-hour build.
- No Brim-specific policy logic until the fraud engine is stable.
- No production authentication, RBAC, or database deployment.
- No opaque ML-only explanations.

## Reviewer Workflow

The reviewer opens a one-at-a-time queue sorted by risk score. Each item includes the transaction, risk level, primary fraud pattern, component scores, xFraud graph score, and top reasons. They can approve, dismiss, or escalate from the detail panel or use keyboard actions for rapid review. Undo restores the prior status. Every action is written to the audit log with a reviewer name such as `agent_reviewer`, and dismissals can suppress similar future pending items inside the same session.

The selected or hovered transaction drives the graph highlight and timeline panel. The graph shows the transaction's card, merchant, device, IP, category/country cluster, and nearby flagged transactions. The timeline shows the selected card's transaction history plus related merchant/device/IP activity.

## Entity Context Contract

- `transaction -> card`
- `transaction -> merchant`
- `transaction -> device`
- `transaction -> ip`
- `transaction -> category/country cluster`
- `card -> transaction timeline`
- `merchant/device/ip -> related transactions`

Required local API surfaces:

- `GET /transactions/{id}/context`
- `GET /entities/{type}/{id}`
- `GET /cards/{card_id}/timeline`
- `GET /graph?transaction_id=...`
