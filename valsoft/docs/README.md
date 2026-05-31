# Valsoft Challenge Docs

This directory is the canonical home for Valsoft Fraud Hunter requirements, planning, and delivery notes.

| File | Purpose |
| --- | --- |
| `challenge_brief_updated.md` | Official Fraud Hunter challenge brief and scoring rubric |
| `MPC_HACKS_HACKER_MANUAL.md` | Event manual and sponsor challenge context |
| `VALSOFT_PRD.md` | Reviewer-facing product requirements document |
| `IMPLEMENTATION_PLAN.md` | Architecture, engineering decisions, and skipped work |
| `HYPOTHESIS_LOG.md` | Fraud hypotheses and final detection decisions |
| `FRAUD_DETECTION_PLAN.md` | Research-backed fraud detection strategy |
| `MIMIR_CHALLENGE_PLAN.md` | Broader Mimir challenge execution plan |

Generated scoring artifacts live in `../output`, including:

- `transactions_with_mimir_risk.csv`: all challenge rows with fraud/risk columns appended
- `identified_fraud_transactions.csv`: flagged transaction IDs with fraud pattern and reason codes
- `risk_results.json`: full scored transaction payload and summary
- `review_queue.json`: reviewer queue sorted by risk
