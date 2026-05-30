## Build **Mimir** as one platform, not two demos

The winning concept is:

> **Mimir — Transaction Wisdom OS**
> A unified transaction intelligence platform where every transaction becomes an evidence-backed case: fraud risk, policy violation, pre-approval request, expense report item, or compliance dry-run artifact.

This makes Brim and Valsoft feel like one product because the platform has **one canonical ledger**, **one risk engine**, **one explanation system**, and **one human review workflow**, with two sub-dashboards:

1. **Mimir SpendOps** — Brim Financial dashboard
   Plain-English expense intelligence, policy compliance, pre-approval, expense reports, vendor/budget insights.

2. **Mimir RiskOps** — Valsoft dashboard
   Fraud detection, per-card anomaly scoring, graph/burst detection, reviewer queue, audit trail, FINTRAC/FATCA/CRS dry-run readiness.

This directly matches the Brim challenge, which asks for plain-English data interrogation, a policy compliance engine, AI pre-approval, and automated expense report generation.  It also directly matches Valsoft, which asks you to ingest all 1,000 rows, flag suspicious transactions, explain every flag, support approve/dismiss/escalate triage, and output an updated flagged CSV plus PRD and implementation plan. 

The key insight: **Brim violations and Valsoft fraud flags should be the same underlying object.**

```ts
RiskEvent {
  id: string
  source: "brim" | "valsoft"
  event_type:
    | "fraud_suspect"
    | "policy_violation"
    | "approval_required"
    | "expense_report_ready"
    | "compliance_dry_run"
  severity: "low" | "medium" | "high" | "critical"
  score: number
  transaction_ids: string[]
  reasons: ReasonCode[]
  evidence: EvidenceBundle
  recommended_action: string
  status: "new" | "approved" | "dismissed" | "escalated"
  audit_log: ReviewAction[]
}
```

That single abstraction is what will make the project feel coherent.

---

## The project pitch

**Mimir helps finance, risk, and compliance teams understand what is happening inside card transactions before money leaks, policy is abused, or suspicious behavior gets missed.**

For Brim, Mimir answers:

> “Where is the company spending money, what violates policy, what needs approval, and what should the CFO review first?”

For Valsoft, Mimir answers:

> “Which transactions are probably fraud, why, and what should a human reviewer do next?”

For judges, the demo should feel like this:

> “This is not a chatbot. This is a transaction command center. The AI does not guess; it calls deterministic tools, renders validated dashboards, explains risk with evidence, and routes every case through a reviewer workflow.”

---

## Why this should beat generic submissions

Most teams will build one of these:

* A Streamlit fraud table.
* A basic expense chatbot.
* A dashboard with pretty charts.
* A one-off ML model with weak explanations.

You should build something sharper: **a case-management system where AI, analytics, compliance, and human review are integrated.**

Valsoft explicitly says reviewer experience is worth 40 points and expects more than a static table: keyboard triage, clear reasoning, undo, search/filter, feedback loop, cost-aware tuning, and audit trail.  Brim’s judging also rewards AI depth, contextual reasoning, and useful visualizations rather than decoration. 

So the landslide version is not “more features.” It is **fewer features with a polished workflow**:

1. Ask Mimir a spend question.
2. Mimir produces a validated chart and summary.
3. Mimir surfaces policy/fraud cases.
4. A reviewer moves through cases with keyboard shortcuts.
5. Every case has reason codes, evidence, recommendation, audit log.
6. Export: flagged Valsoft CSV, Brim expense report, FINTRAC dry-run payload, FATCA/CRS readiness report.

---

## Existing projects worth borrowing from

Do **not** copy these wholesale. Use them as pattern libraries.

| Area                               | Example                               | What to borrow                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expense AI / Brim-style assistant  | `simplynd/expense-ai`                 | Good architecture pattern: React UI, FastAPI backend, local agentic reasoning, and deterministic SQL-backed tools for arithmetic rather than letting the LLM calculate. ([GitHub][1]) |
| Fraud dashboard                    | `Luissalazarsalinas/Fraud-Detection`  | Basic model-as-API + dashboard pattern using XGBoost and Streamlit. Useful reference, but your UI should be more polished than Streamlit. ([GitHub][2])                               |
| AML/fraud network view             | `sumitdeole/aml_dashboard`            | Use the idea of transaction network visualization to show merchant/device/IP/card relationships. ([GitHub][3])                                                                        |
| Generative UI                      | `vercel-labs/json-render`             | Strong fit for your idea: the AI emits constrained JSON that renders approved components rather than arbitrary UI. ([GitHub][4])                                                      |
| Agent harness                      | `earendil-works/pi`                   | Useful if you want a CLI-style agent console; Pi provides a TypeScript agent harness with tool calling, state management, and a coding-agent CLI. ([GitHub][5])                       |
| CRS/FATCA reference implementation | HMRC CRS/FATCA frontend/backend repos | Useful as reference for report-upload UX and financial-institution management, though Canadian CRA specs should be your authority for the demo. ([GitHub][6])                         |

For Mimir, `json-render` is especially relevant because it lets you define a component catalog and force the AI to generate JSON constrained to that catalog. That gives you “agentic dashboards” without letting the model invent random React. ([json-render][7])

---

## The correct AI architecture

The AI should **not** be the database, the calculator, the fraud detector, or the compliance engine.

The AI should be the **planner and narrator**.

Use this flow:

```text
User asks:
"What did we spend on fuel permits in Q1, and which transactions need approval?"

LLM produces:
QueryPlan JSON

Backend executes:
Polars / DuckDB deterministic queries

Backend returns:
ResultFrame + PolicyFindings + RiskEvents

LLM produces:
Natural-language summary + VisualizationSpec JSON

Frontend renders:
json-render component catalog
```

The agent should output something like:

```json
{
  "intent": "spend_analysis",
  "dataset": "brim",
  "filters": {
    "date_range": ["2026-01-01", "2026-03-31"],
    "merchant_category_code": [9399, 5541, 5542]
  },
  "group_by": ["month", "merchant"],
  "metrics": ["sum_amount", "count_transactions"],
  "visualization": {
    "component": "bar_chart",
    "title": "Q1 fuel, permit, and transportation spend by merchant"
  }
}
```

Then Pydantic validates it, Polars/DuckDB executes it, and `json-render` renders only approved primitives. Pydantic is a good fit because it generates JSON Schema and its core validation is written in Rust. ([Pydantic][8])

---

## Fraud detection: research-backed, but hackathon-practical

The arXiv fraud literature points to four things that matter for your Valsoft model: class imbalance, concept drift, aggregate features, and sequential behavior. ([arXiv][9]) Graph-based fraud research is also highly relevant because fraud often appears through relations between cards, merchants, devices, IPs, and transaction bursts rather than isolated rows. ([arXiv][10]) Self-explainable graph fraud systems like SEFraud are especially relevant because they treat explanations as part of the detection system, not as a decorative afterthought. ([arXiv][11])

But for a 24-hour hackathon, **do not train a full GNN**. Build **GNN-shaped features**.

### Mimir-native fraud model

Use a hybrid detector:

```text
Final Fraud Score =
  0.35 * per_card_anomaly_score
+ 0.25 * graph_burst_score
+ 0.20 * device_ip_risk_score
+ 0.10 * merchant_risk_score
+ 0.10 * sequence_velocity_score
```

Then convert triggered features into human-readable reason codes.

### Core Valsoft features

Build these with Polars:

```text
Per-card baseline:
- amount / card median amount
- amount robust z-score per card
- category rarity per card
- merchant rarity per card
- channel rarity per card
- hour-of-day rarity per card
- cardholder_country != merchant_country
- new merchant country for card
- new online device for card
- new IP for card

Sequence / velocity:
- number of transactions by card in 5m / 30m / 6h
- repeated small online transactions
- repeated merchant family
- time since previous transaction
- same card + same device + same IP burst

Cross-card graph:
- same merchant burst across different cards
- same IP used by multiple cards
- same device used by multiple cards
- merchant-card bipartite degree
- suspicious connected components
- QuickPay / gift-card / electronics cluster detection
```

Use `IsolationForest` or PyOD as the unsupervised model layer, but keep deterministic rules as the backbone. PyOD is a mature anomaly detection library, and scikit-learn/XGBoost are safe choices for simple model layers. ([PyOD][12]) SHAP can be added only if you train a tree model from pseudo-labels, but for the demo, explicit reason codes are safer than pretending SHAP explains an unsupervised heuristic. ([SHAP][13])

---

## What your uploaded Valsoft CSV is already telling us

I inspected `transactions.csv` locally. The fraud patterns look very discoverable. Build your hypothesis log around these.

### Pattern 1 — QuickPay merchant bursts across many cards

There are two obvious `QuickPay Online` bursts:

```text
2026-05-05 ~02:15–03:27
tx_000995, tx_000996, tx_000997, tx_000998, tx_000999, tx_001000

2026-05-17 ~14:10–15:22
tx_001001, tx_001002, tx_001003, tx_001004, tx_001005, tx_001006, tx_001007
```

These are exactly the kind of cross-card aggregation Valsoft says top teams should catch: merchant-level bursts, device reuse, IP reuse, and patterns invisible from single-row scoring. 

### Pattern 2 — Gift-card / electronics high-value online attacks

Suspicious clusters include:

```text
card_018:
tx_000992, tx_000993, tx_000994
Gift Card Mall / Apple Gift Card
same device and IP, high amounts

card_016:
tx_000986, tx_000987
Gift Card Mall / Apple Gift Card
same device and IP, high amounts

card_020:
tx_000988, tx_000989, tx_000990, tx_000991
Apple Store / Newegg
same device and IP, high amounts
```

Reason codes should say things like:

```text
High-risk online purchase cluster: 3 gift-card transactions on same card,
same device, same IP, total > $4,000, category rare for this card.
```

### Pattern 3 — Card-testing microtransactions

There are rapid low-dollar online bursts from the same device/IP:

```text
card_023: tx_000939–tx_000948
card_042: tx_000949–tx_000956
card_049: tx_000957–tx_000967
card_038: tx_000968–tx_000977
```

These are small amounts, so a high-amount detector misses them. Your model should flag:

```text
8+ online purchases under $15 in under 45 minutes from same device/IP.
```

### Pattern 4 — High-ticket category outliers

Examples:

```text
tx_000920 Apple Store $1900.28
tx_000921 Apple Store $1148.20
tx_000922 Best Buy $696.48
tx_000923 Air Canada $614.82
```

Do not flag these on amount alone. Flag when combined with rare category, rare merchant, unusual country/channel/device, or temporal proximity.

---

## What your Brim CSV is already telling us

I inspected `dummy_data.csv` locally. It is not a generic office SaaS dataset. It looks like a **transportation / trucking / permits / fuel / fleet operations** dataset:

```text
Top merchant families:
- DTOPS SINGLE CROSSING
- AB TRANSP
- NDHP-E PERMIT
- SD DEPT OF TRANS OPS
- TXDMV OS PERMIT
- CAT SCALE COMPANY
- WSDOT COMMERCIAL VEHIC
- fuel / truck stop merchants
```

This is an advantage. Do **not** demo generic “marketing spent on software” if the data is really fleet/permit-heavy. Demo something like:

> “Which permit, fuel, toll, and fleet expenses are driving monthly spend, and which ones violate approval or receipt requirements?”

The Brim policy says expenses over $50 require pre-authorization and receipts, corporate cards are for business expenses, only the named individual may use the card, personal expenses are prohibited, and abuse can lead to restrictions or revocation.  It also has specific rules for entertainment, alcohol, tips, transportation, car rentals, parking, gas receipts, and tickets. 

One important implementation issue: your provided Brim CSV columns do **not** appear to include employee, department, approver, receipt status, or budget. But the Brim challenge requires reasoning across departments/personnel and pre-approval workflows.  So create a deterministic enrichment layer:

```text
brim_enriched.parquet:
- transaction_id
- employee_id
- employee_name
- department
- cost_center
- manager_id
- receipt_status
- preapproval_status
- business_purpose
- expense_report_id
```

Make it clear in the README:

> “The raw Brim file did not include personnel/department fields, so Mimir adds a deterministic synthetic org layer to demonstrate the required workflow without altering the original transaction file.”

That is better than pretending those fields exist.

---

## Brim policy engine

Implement rules as data, not hard-coded spaghetti.

```yaml
rules:
  - id: BRIM_APPROVAL_50
    title: Expenses over $50 require pre-authorization and receipt
    applies_when:
      amount_gt: 50
    requires:
      - preapproval_status == "approved"
      - receipt_status == "attached"
    severity: medium

  - id: BRIM_PERSONAL_CARD_USE
    title: Corporate card personal use prohibited
    applies_when:
      merchant_category in ["personal", "unknown_high_risk"]
    severity: high

  - id: BRIM_TICKET_NOT_REIMBURSABLE
    title: Traffic and parking tickets are not reimbursable
    applies_when:
      merchant_text_contains_any: ["ticket", "fine", "violation"]
    severity: high

  - id: BRIM_TIP_LIMIT
    title: Tips above policy threshold require review
    applies_when:
      category == "restaurant"
      tip_percent_gt: 20
    severity: medium
```

The rule engine should output the same `RiskEvent` object as Valsoft fraud.

Example Brim reason:

```text
Requires approval: transaction is $1,179.09, above the $50 approval threshold.
Receipt missing. Merchant appears fuel/fleet-related, so recommendation is
"request receipt and manager approval," not automatic rejection.
```

That nuance matters: policy engines should distinguish **violation**, **approval required**, and **evidence missing**.

---

## FINTRAC, FATCA, CRS: make it a dry-run compliance layer

Do not submit anything. Build **Compliance Dry Run**.

### FINTRAC

FINTRAC’s API report submission supports secure system-to-system transfer for Suspicious Transaction Reports, Electronic Funds Transfer Reports, Large Cash Transaction Reports, Large Virtual Currency Transaction Reports, and Casino Disbursement Reports. ([FINTRAC][14]) FINTRAC also publishes validation rules for Suspicious Transaction Reports submitted through API. ([FINTRAC][15])

For the hackathon, implement:

```text
/compliance/fintrac/dry-run
  - Generates STR-like JSON envelope
  - Validates required fields against your local schema subset
  - Adds "NOT_SUBMITTED_DRY_RUN": true
  - Stores payload in audit log
  - Never calls FINTRAC
```

Use the narrative guidance seriously: FINTRAC expects clear, complete, accurate descriptions, and says STR narratives should avoid organization-specific jargon so outsiders can understand them. ([FINTRAC][16])

Example dry-run output:

```json
{
  "dry_run": true,
  "submitted": false,
  "report_type": "STR",
  "reason": "Multiple high-value online transactions at gift-card merchants from same card, device, and IP within a short period.",
  "transactions": ["tx_000992", "tx_000993", "tx_000994"],
  "validation_status": "pass_with_warnings",
  "warnings": [
    "Missing customer KYC profile; demo dataset contains cardholder_country only."
  ]
}
```

### FATCA / CRS

For Canada, treat FATCA/CRS as **CRA Part XVIII / Part XIX XML-readiness**, not actual filing. CRA says Part XVIII and Part XIX information returns must be filed electronically through Web Forms or Internet file transfer XML, and recommends using a validating parser before submission. ([Canada][17]) CRA also publishes XML specifications for Part XVIII and Part XIX returns. ([Canada][18])

Build:

```text
/compliance/crs-fatca/dry-run
  - Creates reportability checklist
  - Validates mock XML shape locally
  - Shows missing KYC fields
  - Does not file anything
```

The HMRC CRS/FATCA repos are useful references for upload/reporting workflow UX, but for your Canadian demo, CRA sources should be the compliance anchor. ([GitHub][6])

---

## Best technical stack for you and Codex

Use Python where correctness matters, TypeScript where UX matters, and Rust-backed libraries where speed matters. Do **not** write custom Rust during the hackathon unless absolutely necessary.

| Layer            | Use                                             | Why                                                                                                                                        |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Data engine      | **Polars**                                      | Fast DataFrame engine written in Rust; supports lazy/eager execution, streaming, query optimization, multithreading, Arrow. ([GitHub][19]) |
| Analytical SQL   | **DuckDB**                                      | Great for local analytics, Parquet, filter/projection pushdown, and clean SQL-backed agent tools. ([DuckDB][20])                           |
| API              | **FastAPI**                                     | High-performance Python API framework based on type hints. ([FastAPI][21])                                                                 |
| Schemas          | **Pydantic v2**                                 | JSON Schema generation, validation, serialization, Rust core. ([Pydantic][8])                                                              |
| Fraud model      | **scikit-learn + PyOD + optional XGBoost**      | IsolationForest/LOF/HBOS for anomaly detection; XGBoost only if you create high-confidence pseudo-labels. ([PyOD][12])                     |
| Graph features   | **NetworkX**                                    | Enough for card-device-IP-merchant graphs on 1,000 rows. No need for PyG/DGL.                                                              |
| Frontend         | **Next.js + TypeScript + Tailwind + shadcn/ui** | Fast polished UI, easier than Streamlit for judge-facing product feel.                                                                     |
| Generative UI    | **json-render**                                 | AI emits constrained JSON components, perfect for your visualization primitives idea. ([GitHub][4])                                        |
| Charts           | **ECharts or Recharts**                         | Fast enough, attractive, easy dashboards.                                                                                                  |
| State            | **Zustand or Jotai**                            | Reviewer queue, undo stack, filters.                                                                                                       |
| Keyboard UX      | **cmdk / kbar + hotkeys**                       | Make approve/dismiss/escalate feel instant.                                                                                                |
| Tests            | **pytest + vitest + Playwright smoke test**     | Enough to satisfy engineering craft.                                                                                                       |
| Package managers | **uv + pnpm**                                   | Fast, reproducible.                                                                                                                        |
| Lint/format      | **ruff + pyright + eslint**                     | Codex-friendly guardrails.                                                                                                                 |

---

## Repository structure based on your current tree

Your current structure is a good starting point, but `mimir/` should become the actual product root. Keep `brim/` and `valsoft/` as raw challenge folders/reference inputs.

```text
mpc-hacks/
  .codegraph/
  .codex/

  brim/
    data/
      dummy_data.csv
    docs/
      Brim Expense Policy.pdf
      brim-mpc-hackathon-brief.docx

  valsoft/
    data/
      transactions.csv
    docs/
      challenge_brief_updated.md

  mimir/
    README.md
    AGENTS.md
    PRD.md
    IMPLEMENTATION_PLAN.md
    HYPOTHESIS_LOG.md
    COMPLIANCE_DRY_RUN.md
    DEMO_SCRIPT.md

    pyproject.toml
    package.json
    pnpm-workspace.yaml
    Makefile

    data/
      raw/
        brim/
        valsoft/
      processed/
        canonical_transactions.parquet
        brim_enriched.parquet
        valsoft_scored.parquet
        risk_events.parquet
      exports/
        valsoft_transactions_flagged.csv
        brim_expense_report_demo.csv
        fintrac_str_dry_run.json
        crs_fatca_validation_report.json

    apps/
      api/
        src/mimir_api/
          main.py
          routes/
            ingest.py
            ask.py
            risk_events.py
            fraud.py
            policy.py
            reports.py
            compliance.py

      web/
        app/
          page.tsx
          spendops/
          riskops/
          cases/
        components/
          dashboard/
          case-queue/
          charts/
          json-render/
          command-menu/

    packages/
      schemas/
        canonical_transaction.py
        risk_event.py
        policy_rule.py
        visualization_spec.py
        compliance.py

      engine/
        ingest/
          brim_loader.py
          valsoft_loader.py
          canonicalize.py
        features/
          card_baselines.py
          velocity.py
          graph_features.py
          merchant_features.py
        detection/
          fraud_rules.py
          anomaly_model.py
          scorer.py
          explanations.py
        policy/
          brim_policy.yaml
          rule_engine.py
        reports/
          expense_report_builder.py
        compliance/
          fintrac/
            schema_subset.py
            dry_run.py
          crs_fatca/
            xml_builder.py
            validator.py

      agent/
        query_planner.py
        tool_registry.py
        prompt_templates/
          ask_data.md
          explain_case.md
          approval_recommendation.md

    tests/
      test_valsoft_known_patterns.py
      test_policy_rules.py
      test_canonical_schema.py
      test_compliance_dry_run.py
```

---

## Concrete API endpoints

Build these first:

```text
POST /api/ingest/all
GET  /api/health

GET  /api/risk-events?source=valsoft
GET  /api/risk-events?source=brim
POST /api/risk-events/{id}/decision
POST /api/risk-events/{id}/undo

POST /api/ask
POST /api/brim/policy/scan
POST /api/brim/reports/generate

POST /api/valsoft/score
GET  /api/valsoft/export-flagged-csv

POST /api/compliance/fintrac/dry-run
POST /api/compliance/crs-fatca/dry-run
```

Codex should implement each endpoint against deterministic service functions, not business logic directly inside route files.

---

## The UI that will impress judges

### Home: Mimir Command Center

Show:

```text
- Total spend analyzed
- Transactions processed
- Open cases
- High-risk fraud cases
- Policy violations
- Approval-required transactions
- Compliance dry-run status
```

Two big navigation cards:

```text
SpendOps — Brim Financial
RiskOps — Valsoft Fraud Hunter
```

### SpendOps dashboard

Core panels:

```text
1. Ask Mimir
   "Which transportation permit merchants drove the biggest spend this month?"

2. Policy Monitor
   - Over $50 approval required
   - Missing receipt
   - Possible split transaction
   - Personal/prohibited merchant
   - Repeat offender

3. Expense Report Builder
   - Group by trip / merchant / week / employee
   - Attach policy findings
   - Generate CFO-ready report

4. Approval Inbox
   - Approve / deny / request info
   - AI recommendation with evidence
```

### RiskOps dashboard

Core panels:

```text
1. Fraud Review Queue
   - One transaction/cluster at a time
   - Keyboard shortcuts:
     A = approve legitimate
     D = dismiss flag
     E = escalate
     U = undo

2. Evidence Panel
   - Reason codes
   - Card baseline
   - Similar transactions
   - Device/IP/merchant graph
   - Timeline

3. Cost Slider
   - False positive cost vs missed fraud cost
   - Shows flag count changing

4. Export
   - Download flagged transaction CSV
```

Valsoft explicitly asks for approve/dismiss/escalate triage and says keyboard navigation is expected.  Make that a centerpiece of the demo.

---

## Visualization primitives for `json-render`

Define a small catalog. Do not overbuild.

```ts
type MimirComponent =
  | "metric_grid"
  | "bar_chart"
  | "line_chart"
  | "stacked_bar_chart"
  | "transaction_table"
  | "risk_case_card"
  | "review_queue"
  | "policy_violation_list"
  | "network_graph"
  | "approval_recommendation"
  | "expense_report"
  | "compliance_dry_run_card"
```

Example model output:

```json
{
  "component": "risk_case_card",
  "title": "Gift-card attack cluster on card_018",
  "severity": "critical",
  "score": 0.97,
  "transaction_ids": ["tx_000992", "tx_000993", "tx_000994"],
  "reasons": [
    "Three high-value gift-card transactions on same card",
    "Same device and IP reused",
    "Category is rare for this card",
    "Total cluster amount exceeds normal card baseline"
  ],
  "actions": [
    {"label": "Escalate", "action": "ESCALATE_CASE"},
    {"label": "Dismiss", "action": "DISMISS_CASE"},
    {"label": "Mark legitimate", "action": "APPROVE_CASE"}
  ]
}
```

This gives you the “agent creates dashboard primitives” effect while keeping the product safe and deterministic.

---

## Implementation plan for the hackathon

### Phase 1 — Canonical data layer

Build this immediately.

```text
CanonicalTransaction:
- id
- source
- timestamp
- amount
- currency
- merchant_name
- merchant_category
- merchant_category_code
- channel
- card_id
- employee_id
- department
- cardholder_country
- merchant_country
- device_id
- ip_address
- raw
```

Output:

```text
canonical_transactions.parquet
```

### Phase 2 — Valsoft detector

Implement:

```text
make score-valsoft
```

Output:

```text
valsoft_scored.parquet
valsoft_transactions_flagged.csv
risk_events.parquet
```

Detection modules:

```text
card_baselines.py
velocity.py
graph_features.py
fraud_rules.py
anomaly_model.py
explanations.py
```

Minimum tests:

```text
test_quickpay_burst_is_flagged()
test_card_testing_burst_is_flagged()
test_normal_small_restaurant_purchase_not_flagged()
```

### Phase 3 — Brim policy engine

Implement:

```text
make scan-brim-policy
```

Output:

```text
brim_policy_findings.parquet
brim_expense_report_demo.csv
risk_events.parquet
```

Minimum tests:

```text
test_over_50_requires_approval_and_receipt()
test_car_rental_requires_receipt()
test_policy_rule_outputs_reason_code()
```

### Phase 4 — Frontend

Build only three polished pages:

```text
/
  Mimir Command Center

/spendops
  Ask data + policy queue + expense report

/riskops
  Fraud queue + evidence + graph + export
```

Do not build login, billing, settings, complex admin, or real notifications.

### Phase 5 — Compliance dry-run

Build:

```text
make compliance-dry-run
```

Output:

```text
fintrac_str_dry_run.json
crs_fatca_validation_report.json
```

Show status clearly:

```text
Dry run only. No external submission performed.
```

---

## What to say in the README / PRD

Your PRD should frame Mimir as:

```text
User:
- Finance manager
- Fraud reviewer
- Compliance/risk lead

Problem:
- Transaction volume is too high for manual review.
- Expense policy enforcement is inconsistent.
- Fraud systems produce scores without reasons.
- Compliance artifacts are created too late.

Solution:
- Unified transaction intelligence platform.
- Every suspicious or approval-relevant transaction becomes a case.
- AI helps ask questions and summarize evidence.
- Deterministic rules/models produce scores and reason codes.
- Human reviewer remains in control.

Not building:
- Real FINTRAC submission
- Real CRA FATCA/CRS filing
- Production KYC onboarding
- Real receipt OCR
- Full GNN model
- Full accounting integration
```

---

## Demo script: 7 minutes

Use this exact sequence.

### 0:00–0:45 — Positioning

> “Mimir is a transaction wisdom platform. It unifies Brim’s expense intelligence challenge and Valsoft’s fraud challenge into one operating system: every transaction becomes an evidence-backed case.”

### 0:45–2:00 — SpendOps / Brim

Ask:

```text
What were our largest transportation, fuel, and permit merchants this quarter?
```

Show:

```text
- Bar chart
- Top merchants
- Summary
- Policy cases requiring approval/receipt
```

Then show:

```text
Generate an expense report for recent permit and fuel transactions with policy findings.
```

### 2:00–3:30 — Policy compliance and approval

Open one case:

```text
Amount > $50
Receipt missing
Approval required
Merchant appears legitimate fleet/permit spend
Recommendation: request receipt + manager approval, not reject
```

This demonstrates contextual policy intelligence.

### 3:30–5:30 — RiskOps / Valsoft

Open fraud queue.

Show:

```text
QuickPay Online burst
Gift-card cluster
Card-testing microtransactions
```

Use keyboard:

```text
E = escalate
D = dismiss
U = undo
```

Show audit log.

### 5:30–6:15 — Cost-aware tuning

Move slider:

```text
False positives costly → fewer flags
Missed fraud costly → more flags
```

Show flag count changing.

### 6:15–7:00 — Compliance dry-run and exports

Show:

```text
- flagged Valsoft CSV
- FINTRAC STR dry-run JSON
- CRS/FATCA readiness report
- no external submission
```

Finish with:

> “Mimir is not just detecting anomalies. It gives the human reviewer the evidence, the workflow, the audit trail, and the export artifacts.”

---

## What to skip

Skip these, even if tempting:

```text
- Full GNN training
- Real FINTRAC submission
- Real CRA filing
- Receipt OCR
- Multi-tenant auth
- Complex database setup
- Full notification/email workflow
- Overly broad chatbot
- Streamlit-only UI
```

The project wins by being **polished, explainable, and coherent**, not by having 20 half-built features.

---

## Final build recommendation

Build **Mimir Core + two dashboards**:

```text
Mimir Core:
- canonical ledger
- risk event schema
- rule engine
- fraud scoring engine
- explanation engine
- audit log
- dry-run compliance exports

SpendOps:
- Ask Mimir
- policy scan
- pre-approval recommendation
- expense report generation

RiskOps:
- fraud scoring
- graph/burst detection
- keyboard review queue
- cost-aware tuning
- flagged CSV export
```

This is the strongest direction because it satisfies Brim’s required capabilities, satisfies Valsoft’s scoring/reviewer/engineering criteria, gives judges a coherent product story, and lets Codex build the system in clean, testable modules rather than a chaotic demo. Build the graph-inspired fraud features, the shared case queue, and the JSON-render dashboard primitives first. Everything else is secondary.

[1]: https://github.com/simplynd/expense-ai?utm_source=chatgpt.com "simplynd/expense-ai"
[2]: https://github.com/Luissalazarsalinas/Fraud-Detection?utm_source=chatgpt.com "Credit Card Transaction Fraud Detection"
[3]: https://github.com/sumitdeole/aml_dashboard?utm_source=chatgpt.com "sumitdeole/aml_dashboard: This project develops a fraud ..."
[4]: https://github.com/vercel-labs/json-render?utm_source=chatgpt.com "vercel-labs/json-render: The Generative UI framework"
[5]: https://github.com/earendil-works/pi?utm_source=chatgpt.com "earendil-works/pi: AI agent toolkit: coding ..."
[6]: https://github.com/hmrc/crs-fatca-reporting-frontend?utm_source=chatgpt.com "hmrc/crs-fatca-reporting-frontend"
[7]: https://json-render.dev/?utm_source=chatgpt.com "json-render | The Generative UI Framework"
[8]: https://pydantic.dev/docs/validation/latest/concepts/json_schema/?utm_source=chatgpt.com "JSON Schema | Pydantic Docs"
[9]: https://arxiv.org/abs/2010.06479?utm_source=chatgpt.com "Credit card fraud detection using machine learning: A survey"
[10]: https://arxiv.org/abs/2411.05815?utm_source=chatgpt.com "Graph Neural Networks for Financial Fraud Detection: A Review"
[11]: https://arxiv.org/abs/2406.11389?utm_source=chatgpt.com "SEFraud: Graph-based Self-Explainable Fraud Detection via Interpretative Mask Learning"
[12]: https://pyod.readthedocs.io/?utm_source=chatgpt.com "pyod 3.5.3 documentation"
[13]: https://shap.readthedocs.io/?utm_source=chatgpt.com "Welcome to the SHAP documentation — SHAP latest ..."
[14]: https://fintrac-canafe.canada.ca/reporting-declaration/Info/api/api-eng?utm_source=chatgpt.com "FINTRAC API report submission - canafe - Canada.ca"
[15]: https://fintrac-canafe.canada.ca/reporting-declaration/info/api/validation/str-dod-api-eng?utm_source=chatgpt.com "Validation rules for the submission of Suspicious Transaction ..."
[16]: https://fintrac-canafe.canada.ca/guidance-directives/transaction-operation/str-dod/str-dod-eng?utm_source=chatgpt.com "Reporting suspicious transactions to FINTRAC - canafe"
[17]: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/completing-slips-summaries/financial-slips-summaries/part-xviii-information-return-international-exchange-information-on-financial-accounts/electronic-filing-only-using-internet-file-transfer-xml-web-forms.html?utm_source=chatgpt.com "Electronic filing only by using Internet file transfer (XML) or ..."
[18]: https://www.canada.ca/en/revenue-agency/services/e-services/filing-information-returns-electronically-t4-t5-other-types-returns-overview/xml-specs.html?utm_source=chatgpt.com "XML specifications for all information return types"
[19]: https://github.com/pola-rs/polars?utm_source=chatgpt.com "pola-rs/polars: Extremely fast Query Engine ..."
[20]: https://duckdb.org/docs/current/data/parquet/overview.html?utm_source=chatgpt.com "Reading and Writing Parquet Files"
[21]: https://fastapi.tiangolo.com/?utm_source=chatgpt.com "FastAPI - FastAPI"
