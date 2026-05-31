# Valsoft Fraud Hunter PRD

This PRD defines the reviewer-facing product scope for Mimir's Valsoft Fraud Hunter build.

---

## User

The primary user is a trust and safety reviewer at a payments company. They review suspicious card activity, decide whether a transaction should be approved, dismissed, escalated, declined, or blocked, and need enough context to defend that decision later.

Secondary users are engineering and risk leads who need to understand how the detector works, reproduce the outputs, and see where reviewer feedback enters the next run.

## Problem

The user receives 1,000 card transactions across 50 cards. The fraud rate is low enough that reviewing everything is wasteful, but high enough that missed fraud damages customers, merchants, and trust. The challenge data hides multiple fraud families, including patterns that only appear when transactions are compared across cards.

The product problem is not just "rank rows by anomaly." The reviewer needs a short queue, clear evidence, entity context, and a decision trail.

## Success criteria

| Goal | Acceptance criteria |
| --- | --- |
| Complete ingestion | All 1,000 challenge rows load and validate from `transactions.csv` |
| Accurate prioritization | Balanced mode produces a small ranked queue, currently 80 rows |
| Explainability | Every flagged row has at least one human-readable reason with evidence |
| Reviewer speed | Reviewer can move through pending flags with keyboard navigation and one-key actions |
| Stateful decisions | Approve, dismiss, escalate, decline, block, and undo update local state |
| Auditability | Every reviewer action writes a JSONL audit receipt |
| Challenge export | Updated CSV includes original rows plus explicit fraud flag, pattern, reasons, Mimir risk, and review columns |
| Context | Transaction detail includes card, merchant, device, IP, category-country cluster, timeline, and graph links |
| Reproducibility | One scoring command regenerates CSV and JSON outputs |
| Engineering proof | Tests cover known suspicious and known legitimate cases plus review state behavior |

## Non-goals

- Building a production fraud operations platform with authentication, RBAC, queues, and database migrations
- Claiming supervised precision or recall without hidden labels
- Using an opaque model as the only reason for a fraud decision
- Blocking cards or merchants automatically
- Optimizing for a perfect Kaggle-style score at the expense of reviewer trust
- Building Brim expense policy and compliance workflows before the Valsoft fraud pass is stable

## Required workflow

1. The reviewer starts from a strict pending review queue sorted by descending risk.
2. The reviewer opens one transaction and sees score, risk level, primary pattern, top reasons, component scores, xFraud graph score, and raw transaction details.
3. The reviewer inspects related card, merchant, device, IP, category-country, timeline, and graph context.
4. The reviewer presses `A` to approve, `D` to dismiss, `E` to escalate, or uses the CLI/API equivalents.
5. Mimir records the decision in `review_state.json` and writes an audit event to `audit_log.jsonl`.
6. The reviewer can press `U` or call `undo` to reverse the last decision.
7. The updated CSV keeps review status beside the risk signals for handoff, and the fraud ID list gives the final flagged set with explaining patterns.

## User experience requirements

| Requirement | Product decision |
| --- | --- |
| Queue, not table | The dashboard has a strict review tab and command center queue; broader tables stay available for investigation |
| Keyboard review | Arrow keys move selection; `A`, `D`, `E`, and `U` apply actions or undo |
| Reason-first evidence | Reasons are shown as plain language, backed by exact feature evidence |
| Context without overload | The detail view emphasizes top reasons first, then raw fields and related entities |
| Feedback loop | Reviewer decisions are available to the next scoring run and to xFraud pseudo-labeling |
| Audit trail | Review decisions become durable JSONL receipts for demo and inspection |

## Data and entity contract

The transaction is the center of the local graph:

- `transaction -> card`
- `transaction -> merchant`
- `transaction -> device`
- `transaction -> ip`
- `transaction -> category-country cluster`
- `card -> transaction timeline`
- `merchant/device/ip -> related transactions`

Required local API surfaces:

| Endpoint | Contract |
| --- | --- |
| `GET /transactions/{id}/context` | Transaction, reason evidence, entity links, related rows, timeline, graph |
| `GET /entities/{type}/{id}` | Entity summary and related transactions |
| `GET /cards/{card_id}/timeline` | Ordered card history |
| `GET /graph?transaction_id=...` | Nodes and edges for reviewer highlighting |
| `POST /review` | Apply reviewer action |
| `POST /undo` | Reverse latest action |

## Product risks

| Risk | Mitigation |
| --- | --- |
| Hidden labels make tuning uncertain | Favor explainable fraud hypotheses and keep the queue size cost-aware |
| Novel but benign behavior creates false positives | Damp small subscription and utility novelty without temporal or graph evidence |
| Cross-card fraud is invisible in per-card baselines | Include merchant, device, IP, IP-prefix, and graph signals |
| Model output becomes hard to explain | xFraud is supporting evidence with pseudo-label policy exposed in metrics |
| Reviewer decisions are lost | Persist review state and audit log locally |
