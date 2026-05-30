# Brim Expense Intelligence

Brim Expense Intelligence is a hackathon-style finance copilot built with Next.js and TypeScript. It helps a finance team work across three different expense workflows:

- understand historical expense activity from a real workbook
- review policy and compliance issues with deterministic logic
- simulate employee-to-manager approval workflows for new spend

The app is intentionally deterministic-first. Normal application code handles facts, policy checks, flags, counts, workflow states, request evaluation, and report grouping. Claude is used only for explanation, summarization, and grounded question answering over project documents and deterministic outputs derived from them.

## What The App Does

The product currently supports five connected capabilities:

1. Historical dashboard
   - Loads the real workbook sample in the repo
   - Normalizes transactions into a reusable TypeScript model
   - Shows summary metrics, insights, merchant breakdowns, geography, and recent transactions

2. Deterministic compliance review
   - Applies explicit expense-policy rules to historical transactions
   - Separates findings into `risk`, `workflow`, and `info`
   - Surfaces severity counts, flag groups, and transaction-level findings

3. New expense pre-approval
   - Lets a user submit a proposed expense request
   - Runs deterministic policy and workflow checks
   - Produces an advisory recommendation of:
     - `approve`
     - `deny`
     - `review`
     - `investigate`

4. Reviewer decision workflow
   - Simulates employee and manager roles without real authentication
   - Stores submitted requests locally
   - Lets a manager review requests and record a final human decision

5. Expense reports
   - Builds deterministic report clusters from historical transactions
   - Groups related spend into report objects such as trips, meals, local transport, and software bundles
   - Exposes a manager-facing report review surface

## Core Product Philosophy

This project is a decision-support tool, not an autonomous decision-maker.

- Deterministic code is the source of truth for policy logic and workflow state.
- AI does not approve, deny, or replace compliance logic.
- Claude explains and answers questions based on grounded context.
- Historical workbook transactions remain separate from newly submitted expense requests.
- The architecture intentionally avoids heavy RAG, vector databases, complex backend infrastructure, and real auth.

## Data Sources

The app is grounded in two primary source documents:

- Historical workbook:
  - [data/transactions/real-transaction-sample.xlsx](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/data/transactions/real-transaction-sample.xlsx)
- Brim policy document:
  - [data/policy/brim-expense-policy.pdf](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/data/policy/brim-expense-policy.pdf)
  - [data/policy/brim-expense-policy.txt](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/data/policy/brim-expense-policy.txt)

The assistant is designed to answer only from:

- the workbook
- the repo-backed policy document
- deterministic outputs derived from those documents

## Current User Flows

### Manager Mode

Manager mode is the richest view of the product. It currently supports:

- dashboard analysis
- compliance review
- grounded Claude assistant chat
- submitted request review
- expense reports review

Manager users can:

- inspect historical spend patterns
- review compliance findings
- ask natural-language questions about workbook and policy data
- open submitted requests from the request workflow
- record a final decision on a request
- inspect clustered historical expense reports

### Employee Mode

Employee mode is intentionally narrower and requester-oriented.

Employee users can:

- open the pre-approval form
- submit a new expense request
- receive a deterministic advisory review packet

Employee mode does not expose manager workflow surfaces like the dashboard, request board, or expense reports.

## Routes

The app currently exposes these main routes:

- `/`
  - main workspace
  - manager mode shows dashboard, assistant, and workflow navigation
  - employee mode focuses on new request submission
- `/pre-approval`
  - deterministic new expense request form and evaluation flow
- `/expense-reports`
  - manager-facing historical expense reports view

API routes:

- `/api/assistant`
  - grounded Claude chat
- `/api/pre-approval`
  - deterministic pre-approval evaluation
- `/api/transactions`
  - workbook-backed dashboard data

## Architecture Summary

### Frontend

- Next.js App Router
- React + TypeScript
- Global styling through [app/globals.css](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/app/globals.css)

Main UI areas live in:

- [components/app-workspace.tsx](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/components/app-workspace.tsx)
- [components/assistant-panel.tsx](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/components/assistant-panel.tsx)
- [components/compliance-review.tsx](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/components/compliance-review.tsx)
- [components/pre-approval/pre-approval-workbench.tsx](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/components/pre-approval/pre-approval-workbench.tsx)
- [components/manager/requests-board.tsx](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/components/manager/requests-board.tsx)
- [components/manager/expense-reports-board.tsx](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/components/manager/expense-reports-board.tsx)

### Deterministic Data And Rules

Historical transaction loading and normalization:

- [lib/transactions/load-workbook.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/transactions/load-workbook.ts)
- [lib/transactions/normalize.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/transactions/normalize.ts)
- [lib/transactions/get-dashboard-data.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/transactions/get-dashboard-data.ts)

Compliance logic:

- [lib/compliance/evaluate-transactions.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/compliance/evaluate-transactions.ts)
- [lib/compliance/defaults.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/compliance/defaults.ts)

Pre-approval logic:

- [lib/pre-approval/evaluate-pre-approval.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/pre-approval/evaluate-pre-approval.ts)
- [lib/pre-approval/mock-enrichment.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/pre-approval/mock-enrichment.ts)

Expense reports:

- [lib/expense-reports/build-expense-reports.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/expense-reports/build-expense-reports.ts)

Request workflow storage:

- [lib/request-store.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/request-store.ts)

### Assistant Grounding

The assistant uses a lightweight grounded setup rather than a heavy retrieval platform.

Key files:

- [app/api/assistant/route.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/app/api/assistant/route.ts)
- [lib/assistant/build-grounding-context.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/assistant/build-grounding-context.ts)
- [lib/policy/load-policy-document.ts](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/lib/policy/load-policy-document.ts)

How it works:

1. The server loads the workbook-backed dashboard and compliance data.
2. The server loads the repo-backed policy document.
3. The grounding layer deterministically builds context from:
   - workbook facts
   - policy excerpts
   - deterministic compliance outputs
   - deterministic expense report outputs
4. Claude receives only curated grounded context, not business logic authority.

Recent assistant improvements include:

- stricter source-document provenance
- more conversational prompt style
- scoped retrieval for follow-up questions such as:
  - “these transactions”
  - “this category”
  - “above $1000”

## Policy And Compliance Model

The policy engine is deterministic and intentionally conservative. It favors surfacing review and uncertainty over inventing unsupported certainty.

Examples of rule areas currently covered include:

- over-$50 pre-authorization requirement
- duplicate and near-duplicate transaction patterns
- possible split transactions
- fee or cash-advance-like charges
- ambiguous cases that require review
- pre-approval checks for alcohol, entertainment completeness, ticket reimbursement, personal card fee reimbursement, and business-purpose sufficiency

The app uses three main finding groups throughout the product:

- `risk`
- `workflow`
- `info`

This semantic structure is reused across:

- historical compliance review
- pre-approval evaluation
- manager review flows
- expense report findings

## Request Workflow Model

Submitted pre-approval requests are treated as workflow items, not historical transactions.

They are stored separately in lightweight local storage and move through these manager-facing states:

- `new`
- `review`
- `investigate`
- `approved`
- `denied`

The reviewer can choose a final decision independent of the system recommendation.

That separation is intentional:

- system recommendation = advisory
- manager decision = human-owned final workflow state

## Expense Report Model

Expense reports are generated from historical workbook transactions using deterministic clustering heuristics.

Common report types include:

- `trip`
- `client_entertainment`
- `meals`
- `local_transport`
- `software`
- `general`

Grouping signals include:

- date proximity
- merchant and category patterns
- travel-like mixed clusters
- recurring software/service signals

Each generated report includes:

- report title and type
- included transactions
- total amount
- date range
- merchant and category summary
- rationale
- findings
- a derived status of:
  - `ready`
  - `review`
  - `investigate`

## Local Development

### Requirements

- Node.js
- npm

### Install

```bash
npm install
```

### Run The App

```bash
npm run dev
```

Then open `http://localhost:3000`.

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Environment Variables

The assistant requires a local `.env.local` file for live Claude usage.

Expected environment variables:

```bash
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

Notes:

- `.env.local` is intentionally ignored by git.
- The tracked server route still has a fallback default model if the env override is missing.
- The assistant should fail safely if the Anthropic key or policy source document is unavailable.

## Project Structure

```text
app/
  page.tsx
  pre-approval/page.tsx
  expense-reports/page.tsx
  api/

components/
  assistant-panel.tsx
  compliance-review.tsx
  pre-approval/
  manager/

lib/
  assistant/
  compliance/
  expense-reports/
  policy/
  pre-approval/
  request-store.ts
  transactions/

types/
  assistant.ts
  expense-report.ts
  pre-approval.ts
  transactions.ts
```

## What Is Mocked Vs Real

Real sources:

- workbook transaction dataset
- policy document
- deterministic outputs computed from those documents

Explicit demo/mock enrichment:

- employee directory metadata
- department metadata
- approver metadata
- budget context used in pre-approval review

This is intentional because the workbook does not contain a complete HR, organizational, or budgeting system.

## What The AI Does And Does Not Do

Claude is used for:

- natural-language questions about the workbook
- policy explanation
- compliance explanation
- summarization of deterministic outputs
- conversational follow-up on grounded context

Claude is not used for:

- deterministic compliance truth
- policy rule ownership
- final approval or denial decisions
- replacing report grouping logic
- replacing pre-approval evaluation logic

## Current Status

The app is currently demoable end-to-end as a lightweight finance copilot:

- real workbook ingestion works
- deterministic compliance review works
- role simulation works
- pre-approval flow works
- manager request decision flow works
- manager expense reports work
- live grounded Claude chat works locally

## Known Constraints

- No real authentication
- No backend database
- No multi-user concurrency
- No notifications or approval routing engine
- No export/PDF generation for reports yet
- Some pre-approval context uses explicit demo enrichment
- Expense report clustering is heuristic and demo-oriented, not a full accounting engine

## Project Memory

Two project documents should be kept in sync as the app evolves:

- [PROJECT_RULES.md](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/PROJECT_RULES.md)
  - source of truth for product and engineering decisions
- [COMMIT_LOG.md](/Users/ilyessouadi/Desktop/Claude Brim Sub-Challenge/COMMIT_LOG.md)
  - persistent project memory and slice-by-slice change history

If you continue this project in a future session, read those two files first.
