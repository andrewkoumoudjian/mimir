# Brim Expense Intelligence

## Product Brief

### Project Name
Brim Expense Intelligence

### Goal
Build a simple full-stack web app for a hackathon. The product is an AI-powered expense intelligence dashboard for SMBs. It must use the Claude API for AI features. The app helps a finance manager understand historical transaction data, detect policy/compliance issues, review new expense requests, and generate grouped expense reports.

### Core Product Shape
- Main dashboard in the center
- Right-side AI assistant panel
- Historical transaction data as the main dataset
- Brim expense policy as the rule source
- Clean, demo-friendly UI
- Simple architecture
- Built feature by feature using vertical slices

### Important Product Assumptions
- Maintain `COMMIT_LOG.md` as a persistent progress record and update it after every meaningful change.
- Historical transactions come from the provided spreadsheet
- Policy/compliance logic comes from the provided Brim expense policy
- Pre-approval is for a new expense request, so it should be a form, not a transaction file upload
- Expense report generation should create a clean in-app report view first
- Exporting can come later if needed
- If some fields are missing from the dataset, use a small explicit mock enrichment layer rather than pretending the raw data contains everything

### Tech Constraints
- Use Next.js
- Use TypeScript
- Use Claude API for AI features
- Keep storage lightweight, preferably local/simple/in-memory unless persistence is really needed
- Keep the charting minimal
- Keep state management simple
- No heavy backend architecture unless strictly needed

### Target UX
The finance manager should be able to:
- Load transaction data
- Immediately see a simple summary and a few flagged insights
- Ask questions in plain English through the right-side AI assistant
- Review flagged transactions
- Submit a new expense request through a form
- Get an approve / deny / review recommendation
- Generate a grouped expense report view with risky items clearly marked

### Planned Vertical Slices
1. Load transaction data and show a summary dashboard
2. Enable AI chat over the loaded data using Claude API
3. Add policy compliance checks and flagging
4. Add the new expense pre-approval form and recommendation flow
5. Add expense report generation

### Definition Of Done For Any Slice
- The feature works end-to-end
- The UI is understandable
- The code stays simple
- No fake functionality
- The feature is demoable immediately
- `COMMIT_LOG.md` is updated with the meaningful change, why it was made, the slice it belongs to, and any follow-up notes

## Coding And Product Rules

### Mandatory Engineering Rules
1. Keep the code as simple as possible.
2. Build with vertical slices only.
3. Each slice must be usable end-to-end before starting the next.
4. Do not over-engineer architecture.
5. Prefer hardcoded demo assumptions over premature abstractions.
6. Prefer deterministic code for facts, rules, filters, aggregations, and scoring.
7. Use Claude API only where AI is actually needed:
   - Natural-language querying
   - Explanations
   - Summaries
   - Recommendations
8. Do not use AI for logic that should be normal code.
9. Every AI output must be grounded in loaded data and/or explicit policy rules.
10. The app must feel like a finance copilot, not a generic chatbot.
11. Optimize for hackathon demo clarity, not production completeness.
12. Avoid complex auth, queues, jobs, microservices, or unnecessary infra.
13. Avoid unnecessary dependencies.
14. Keep components small and readable.
15. Keep file structure simple.
16. Use good names and simple data flow.
17. Add comments only when they are genuinely useful.
18. Prefer in-app views before export/download features.
19. Make the UI easy to explain in 30 seconds.
20. If data is ambiguous, surface review/uncertainty instead of making strong unsupported claims.

## Source Of Truth

This file is the source of truth for all implementation decisions in this project.

When making implementation decisions:
- Choose the simplest approach that satisfies the current vertical slice
- Avoid abstractions until they are needed by a real second use case
- Keep deterministic business logic in normal TypeScript code
- Use Claude API only for natural-language and explanation-oriented features
- Prefer demo clarity over completeness
- Surface uncertainty clearly when the data or policy is incomplete
- Update `COMMIT_LOG.md` after every meaningful change so future chats can recover project history quickly
