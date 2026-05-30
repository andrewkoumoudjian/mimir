# Brim Expense Intelligence

- Project name: Brim Expense Intelligence
- Current status: The app now simulates employee and manager roles with a lightweight persistent request workflow, a manager-facing expense reports surface, and a live Claude assistant grounded in the workbook plus a repo-backed policy document
- Current active slice: Improve assistant ad-hoc cluster retrieval
- Next planned step: Refine additional assistant query patterns only if needed, while keeping the assistant grounded in the workbook/policy documents and avoiding heavy RAG

## 2026-04-02 21:22 - Establish product rules
- Slice: Foundation / Applies to all slices
- Change: Created `PROJECT_RULES.md` with the full product brief, product assumptions, tech constraints, vertical slice roadmap, and mandatory engineering rules.
- Reason: Lock the project scope and implementation principles before any code is written.
- Notes: `PROJECT_RULES.md` is the source of truth for future implementation decisions.

## 2026-04-02 21:25 - Add persistent progress log
- Slice: Foundation / Applies to all slices
- Change: Created `COMMIT_LOG.md` with a status header and structured markdown history format, and updated `PROJECT_RULES.md` so log updates are part of definition of done.
- Reason: Preserve project history for future chats and make progress tracking part of normal project workflow.
- Notes: Future meaningful changes should append new entries in chronological order without rewriting previous history.

## 2026-04-03 15:04 - Link local project to GitHub repo
- Slice: Foundation / Applies to all slices
- Change: Initialized a local Git repository on `main` and added `origin` pointing to `https://github.com/Ilyes-Souadi/Prompt_Engineers.git`.
- Reason: Connect the project workspace to the intended remote repository before implementation work begins.
- Notes: The remote appeared empty at link time, so no pull or merge step was needed.

## 2026-04-03 15:06 - Add initial gitignore before first push
- Slice: Foundation / Applies to all slices
- Change: Added a minimal `.gitignore` to exclude `node_modules`, Next.js build output, local env files, and npm debug logs from version control.
- Reason: Keep the repository clean and avoid committing generated or machine-specific files in the first commit.
- Notes: `package-lock.json` remains tracked because npm lockfiles are useful and should stay in the repo.

## 2026-04-03 15:16 - Implement slice 1 dashboard and transaction pipeline
- Slice: 1
- Change: Added a minimal Next.js app, a local demo transaction CSV, parsing and normalization utilities, deterministic insight generation, a summary dashboard, geography and merchant breakdown tables, a normalized ledger view, and a visible but disabled AI assistant panel. Also added build and lint configuration for the app.
- Reason: Deliver the first end-to-end demoable slice focused only on transaction intake and overview, while preserving a reusable transaction shape for future slices.
- Notes: The repo does not yet contain the real provided spreadsheet, so slice 1 uses an explicit local demo dataset. Slice 2 should replace the assistant placeholder with grounded Claude chat over the loaded data.

## 2026-04-03 15:25 - Replace invented demo data with real workbook sample
- Slice: 1
- Change: Copied the provided `.xlsx` sample into the repo, replaced the CSV-based loader with a workbook parser, updated normalization to use the real column names and Excel date format, removed the invented demo CSV, and refreshed the dashboard copy to reference the real sample. The ledger table now shows a recent subset while summaries still use the full dataset.
- Reason: Align slice 1 with the actual transaction sample instead of invented data so future slices build on the correct source format and field structure.
- Notes: The real sample currently yields 4,235 transactions and 4 deterministic insights. Added the `xlsx` dependency to keep the spreadsheet handling simple. One `npm audit` high-severity vulnerability was reported after installing `xlsx` and has not been addressed yet.

## 2026-04-03 18:58 - Add deterministic policy compliance engine
- Slice: 2
- Change: Added policy constants sourced from the Brim expense policy PDF, a deterministic compliance evaluator, compliance summary data in the dashboard payload, and a review UI with severity counts, filters, and expandable rule explanations.
- Reason: Deliver a demoable compliance review workflow without any AI, chat, or RAG while keeping every flag grounded in explicit code and the policy document.
- Notes: Implemented rule types for over-$50 pre-authorization, possible split transactions, exact duplicates, near duplicates, fee or cash-advance style charges, and generic needs-review cases. On the current workbook sample the engine returns 4,420 total flags across 3,373 unique transactions.

## 2026-04-03 19:22 - Refine slice 2 to separate risk from workflow noise
- Slice: 2
- Change: Added a `risk` / `workflow` / `info` classification layer to compliance flags, changed pre-authorization items to workflow-weighted severity, and updated the review UI to default to risk-first filtering with grouped summary counters and lighter treatment for non-risk items.
- Reason: Reduce overflagging in the presentation layer so true risk stands out while still tracking process requirements and ambiguous items.
- Notes: The current workbook sample now breaks down as 1,486 risk alerts, 2,736 workflow items, and 198 info items, with 448 high-severity flags after reweighting workflow alerts.

## 2026-04-03 19:31 - Stabilize classification rendering bug
- Slice: 2 bugfix
- Change: Hardened the compliance review component and evaluator with fallback classification counts, default empty arrays, and a default `info` classification when missing so the UI no longer crashes on undefined class data.
- Reason: Fix the runtime error caused by the frontend reading `.risk` before `classificationCounts` was guaranteed to exist.
- Notes: `npm run lint` and `npm run build` both pass after the fix, and the API still returns populated classification counts for the current sample workbook.

## 2026-04-03 19:42 - Fix compliance hydration mismatch
- Slice: 2 bugfix
- Change: Removed client-side fallback zero rendering for compliance summary counts and changed the review component to render only when real server props are present, while keeping server-side summary initialization intact.
- Reason: Fix the hydration warning caused by the server rendering real totals like 4,420 while the client initially rendered fallback zeros.
- Notes: The client now matches the server on first render for compliance totals and classification counts.

## 2026-04-03 19:50 - Normalize compliance data contract to fix .risk crash
- Slice: 2 bugfix
- Change: Added a shared compliance defaults/normalization module, normalized `ComplianceSummary` and flagged items before rendering, and kept `ComplianceReview` reading from a single stable summary shape.
- Reason: Fix the remaining runtime error caused by direct `.risk` access when `classificationCounts` was missing or shaped differently than the component expected.
- Notes: Verified the live API now returns `classificationCounts` and per-flag `classification`, and the app loads with the compliance section visible without the `.risk` crash.

## 2026-04-03 21:02 - Add grounded Claude finance copilot chat
- Slice: 2
- Change: Replaced the disabled assistant placeholder with a real chat panel, added a server-side assistant route that rebuilds the local dashboard and compliance data on each question, and added deterministic grounding context that summarizes workbook facts, policy rules, large transactions, common flag types, and keyword-matched transactions or flags before calling Claude.
- Reason: Deliver the planned chat slice without moving policy logic into AI, so answers stay tied to the loaded workbook and the existing deterministic compliance engine.
- Notes: The assistant uses the Anthropic Messages API with `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL`, defaulting to `claude-sonnet-4-6`. Per `PROJECT_RULES.md`, this chat work is treated as slice 2 even though earlier local compliance entries were logged as slice 2 before the rules file became the source of truth.

## 2026-04-03 22:18 - Add deterministic pre-approval request flow
- Slice: 4
- Change: Added a new `/pre-approval` page with compact request form inputs, a deterministic pre-approval evaluation route, structured policy/workflow/risk checks, advisory recommendation states, grouped review packet UI, and explicit reviewer context that combines workbook-derived similar-spend signals with small mock directory and budget enrichment.
- Reason: Deliver the new spend action layer as a fully demoable form-based slice without relying on any live AI calls or changing the existing dashboard/compliance architecture.
- Notes: Employee, department, approver, and budget context are honest demo enrichment because the workbook has no HR or budget master data. Historical similar-spend notes still use the real workbook through simple deterministic matching.

## 2026-04-03 22:46 - Add reviewer decision workflow to pre-approval
- Slice: 4 follow-up
- Change: Added a human decision panel after the pre-approval evaluation, allowing the reviewer to record a final approve / deny / review / investigate action with an optional note, timestamp, and clear distinction from the advisory system recommendation.
- Reason: Complete the reviewer action step for the pre-approval slice without introducing persistence, backend workflow infrastructure, or any AI dependency.
- Notes: Final reviewer decisions are stored only in lightweight client state for the current session, and can be changed for demo convenience.

## 2026-04-03 23:18 - Add employee/manager workflow simulation with local request store
- Slice: Workflow simulation
- Change: Added a persistent employee/manager role toggle, moved submitted pre-approval requests into a lightweight localStorage-backed request store, and added a manager-facing requests board with status sections for new, review, investigate, approved, and denied requests. Managers can reopen stored requests, inspect the preserved evaluation packet, and update decisions without affecting historical workbook data.
- Reason: Make the requester/approver workflow legible for demo purposes without introducing real authentication, backend persistence, or merging new requests into historical transactions.
- Notes: Role selection and submitted requests are both persisted locally in the browser only. Employee mode hides manager-facing surfaces, while manager mode exposes dashboard and requests views separately.

## 2026-04-03 23:56 - Add manager-facing historical expense reports
- Slice: 5
- Change: Added a manager-only Expense Reports route and tab, a deterministic report builder over workbook-backed historical transactions, and a master-detail reports view with grouped report cards, report detail, report findings, and readiness states.
- Reason: Turn raw historical transactions into reviewable expense report objects that represent business events or spend clusters instead of forcing managers to inspect single transactions one by one.
- Notes: Report grouping uses deterministic date proximity plus merchant/category keyword heuristics for trip, transport, meals, software, and general spend. Report findings reuse historical compliance flags where possible and derive a report status of `ready`, `review`, or `investigate`. Validation: `npm run lint` and `npm run build` both passed.

## 2026-04-04 00:28 - Tighten assistant grounding to source-document provenance
- Slice: 2 hardening
- Change: Added a server-side policy document loader with stable expected paths under `data/policy/`, refactored assistant grounding to require a real policy source document instead of relying on handwritten policy prompt text, and expanded grounded context to include deterministic expense report summaries derived from the workbook.
- Reason: Ensure Claude answers are grounded only in repo-backed source documents and deterministic outputs derived from those documents, without introducing heavy RAG infrastructure.
- Notes: The workbook remains the live transaction source document. The assistant route now expects a real policy document under `data/policy/`, with runtime grounding reading the extracted `brim-expense-policy.txt` companion derived from the PDF. Validation: `npm run lint` and `npm run build` both passed.

## 2026-04-04 00:42 - Activate live policy-grounded assistant locally
- Slice: 2 activation
- Change: Added the Brim policy PDF into `data/policy/`, generated a text companion from that source document for stable server-side runtime grounding, configured the local Anthropic environment, and smoke-tested `/api/assistant` successfully with a live Claude response.
- Reason: Complete the source-document-grounded assistant path end to end on the local machine without introducing heavy retrieval infrastructure or weakening provenance rules.
- Notes: The assistant now answers from the workbook plus the repo-backed policy document and deterministic outputs derived from them. The local `.env.local` remains untracked and should not be committed.

## 2026-04-04 01:03 - Make grounded assistant responses more conversational
- Slice: 2 UX refinement
- Change: Rewrote the assistant system prompt to favor direct chat-style answers, reduced the always-on grounding payload to a smaller baseline, made detailed policy/report/risk context conditional on the user question, reduced message-history carryover, and added a tiny plain-text cleanup step for raw markdown heading/bold artifacts in the assistant UI.
- Reason: Improve the live assistant's conversational quality without weakening the strict workbook/policy grounding rules or moving any deterministic logic into AI.
- Notes: The assistant should now answer more directly, default to shorter responses, and avoid mini-report formatting unless the user explicitly asks for more detail. Validation: `npm run lint` and `npm run build` both passed, and live prompt checks showed shorter plain-text responses without markdown headings.

## 2026-04-04 01:19 - Add deterministic scoped retrieval for assistant follow-up questions
- Slice: 2 retrieval refinement
- Change: Updated the assistant grounding path to carry forward the last explicit month/category scope from recent user turns, match expense report/category/month requests against the full workbook-backed dataset, apply deterministic amount filters like "above $1000", and pass the resulting scoped transaction list to Claude as primary evidence. Also widened the assistant route history window so the grounding builder can still see the earlier scope-setting turn during follow-up questions.
- Reason: Let the assistant answer document-grounded follow-up questions correctly without dumping the full workbook into every prompt or introducing heavy retrieval infrastructure.
- Notes: This keeps the server-side source documents as the real source of truth while giving Claude effective access to the exact transaction subset relevant to the user's question. Validation: `npm run lint` and `npm run build` both passed, and a live three-turn assistant conversation now correctly carries December software scope into the follow-up request for transactions above $1,000.

## 2026-04-04 01:42 - Add root project README for summary and handoff
- Slice: Documentation
- Change: Added a detailed root `README.md` summarizing the product, implemented slices, routes, architecture, data sources, deterministic-vs-AI responsibilities, local setup, environment variables, and current constraints.
- Reason: Make the repo easier to review, demo, and hand off without needing to reconstruct the product from multiple implementation files.
- Notes: The README is intentionally high-level and product-oriented, while `PROJECT_RULES.md` remains the source of truth and `COMMIT_LOG.md` remains the chronological project memory.

## 2026-04-04 03:09 - Add deterministic amount-range clusters for assistant answers
- Slice: 2 retrieval refinement
- Change: Added a reusable transaction-cluster model and helper for deterministic ad-hoc cluster queries, extended the assistant grounding layer to support explicit amount-range requests like `between 100 and 150`, `above 1000`, and scoped variants such as month plus report-type filters, and updated the assistant route to allow longer plain-text cluster continuations in chat. Cluster retrieval now uses workbook-style displayed transaction magnitudes so in-range credit rows are not silently dropped from count-based cluster queries.
- Reason: Fix incomplete assistant answers for dataset-wide numeric range questions by letting the server build exact transaction sets from the full workbook before Claude responds, instead of relying on keyword-matched samples or broad report fallbacks.
- Notes: Validation: `npm run lint` and `npm run build` both passed. Live assistant checks now return 344 transactions totaling `$42,681.30` for the `100–150` range, include the row-23 `$119.48` example in the preview, preserve December sub-filtering, and keep explicit amount-range queries from falling back to noisy report clusters.

## 2026-04-04 00:49 - Switch local assistant model to Claude Haiku 4.5
- Slice: 2 local config
- Change: Updated the local assistant model override in `.env.local` from Sonnet to the stable Claude Haiku 4.5 model identifier.
- Reason: Use a lighter Claude model for the local grounded assistant without changing the route contract or deterministic grounding architecture.
- Notes: This is a local environment change only; the tracked route default remains unchanged unless explicitly updated later.

## 2026-04-04 10:18 - Simplify manager and employee workspace UX
- Slice: UX refinement across slices 1, 4, and 5
- Change: Simplified the main shell by removing the duplicate in-page manager view toggle, tightening top navigation labels, and restructuring the manager dashboard into a clearer overview plus assistant layout with fewer simultaneous sections. Employee mode now presents a single focused new-expense workflow, while manager request and expense report screens were refactored from multi-column status walls into cleaner status-filtered list-plus-detail workspaces.
- Reason: Reduce information overload on the main boards so the demo is easier to understand quickly while preserving the manager/employee role split and the existing deterministic workflow architecture.
- Notes: Validation: `npm run lint` and `npm run build` both passed. The existing Turbopack tracing warning tied to `next.config.ts` and the policy document loader still appears during build and was not introduced by this UX change.

## 2026-04-04 10:32 - Compress assistant panel and fix internal scrolling
- Slice: 2 UX refinement
- Change: Reduced the manager assistant panel to the essentials by removing the extra header, status, stats, and setup copy, leaving the recommended questions, conversation area, message box, and submit button. Updated assistant panel layout and overflow behavior so the panel stays compact and its message area scrolls inside the panel instead of forcing the whole page to scroll first.
- Reason: Make the Claude surface easier to reach and use during demos by cutting non-essential content and improving chat ergonomics on the dashboard.
- Notes: Validation: `npm run lint` and `npm run build` both passed. The pre-existing Turbopack tracing warning during build remains unchanged.

## 2026-04-04 10:45 - Shift dashboard from presentation style to product UI
- Slice: UX refinement across slices 1 and 2
- Change: Reduced the visual weight of top-level summary metrics by converting them into compact cards, removed more tutorial-style explanatory copy from the manager and employee workspace, and reworked the main dashboard content into a more operational overview layout with findings, merchants, geography, compliance, and ledger sections labeled more like a live product.
- Reason: Make the app feel closer to a deployed internal tool and less like a feature presentation, while keeping the same deterministic architecture and manager/employee workflow split.
- Notes: Validation: `npm run lint` and `npm run build` both passed. The existing Turbopack tracing warning tied to assistant/policy file tracing still appears and was not introduced by this UI refinement.

## 2026-04-04 10:53 - Restore full manager override authority in request decisions
- Slice: 4 bugfix
- Change: Fixed the manager request board so the currently visible request can always be changed to any final decision state, instead of silently snapping back to the system recommendation when the default selected request had not been explicitly clicked first. Also reset local decision draft state when switching request-status tabs.
- Reason: The system recommendation is advisory only, and the manager must remain the final decision-maker for every request.
- Notes: Validation: `npm run lint` and `npm run build` both passed. The existing Turbopack tracing warning during build remains unchanged.

## 2026-04-04 11:08 - Refine the interface toward a production-style finance app
- Slice: UX refinement across manager and employee surfaces
- Change: Reworked the visual system from a warm presentation-like look into a cleaner app shell with modern sans typography, lighter surfaces, subtler status chrome, and tighter navigation/header treatment. Removed more tutorial-style copy and verbose empty states from request, report, and pre-approval detail panels so the screens read like working product surfaces rather than narrated demo sections.
- Reason: Keep all existing functionality while making the app feel closer to a deployed internal finance product and removing UI elements that are not necessary in normal usage.
- Notes: Validation: `npm run lint` and `npm run build` both passed. The existing Turbopack tracing warning tied to assistant/policy file tracing still appears and was not introduced by this pass.

## 2026-04-04 11:17 - Replace top merchants table with a dashboard column chart
- Slice: Dashboard UX refinement
- Change: Replaced the manager dashboard's top-merchants table with a lightweight CSS-based column chart that shows merchant spend visually while still keeping spend amount and share labels on each bar.
- Reason: Make the dashboard faster to scan and more visually useful in normal app usage without adding dependencies or changing any data logic.
- Notes: Validation: `npm run lint` and `npm run build` both passed. The existing Turbopack tracing warning during build remains unchanged.
