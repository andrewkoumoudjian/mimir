# Valsoft Fraud Hunter PRD

## User

The user is a trust and safety reviewer at a payments company. They need to review a small, high-signal queue rather than scan every transaction.

## Problem

The reviewer has 1,000 card transactions with hidden fraud across multiple behavior patterns. They need the system to rank likely fraud, explain why each item is suspicious, and let them decide quickly whether to approve, dismiss, or escalate.

## Success

- All 1,000 rows are processed reproducibly.
- The default queue catches the major hidden fraud patterns without flooding the reviewer.
- Every flagged transaction has at least one concrete, human-readable reason.
- Reviewer decisions are stateful and undoable.
- CSV and JSON outputs are ready for a frontend or judge demo.

## Non-Goals

- No neural network or full GNN in the 24-hour build.
- No Brim-specific policy logic until the fraud engine is stable.
- No production authentication, RBAC, or database deployment.
- No opaque ML-only explanations.

## Reviewer Workflow

The reviewer opens the dashboard queue sorted by risk score. Each queue item includes the transaction, risk level, primary fraud pattern, component scores, and top reasons. They can approve, dismiss, or escalate from the detail panel, or use keyboard actions (`A`, `D`, `E`, `U`) to review quickly. Undo restores the prior status. Dismissals are written to the audit log and can suppress similar future pending items inside the same session.
