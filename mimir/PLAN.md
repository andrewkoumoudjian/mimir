You are Codex working inside the Mimir hackathon repository.

Project context:
Mimir is a unified transaction intelligence platform for the Valsoft Fraud Hunter challenge and the Brim Financial Expense Intelligence challenge.

The strategic build order is:
1. Build the Valsoft-grade fraud/risk engine first.
2. Build Brim-specific finance intelligence features on top of the same transaction intelligence objects.
3. Do NOT create two separate products. Everything must share the same ingestion pipeline, transaction schema, scoring engine, explanation engine, and review state.

Primary goal for this task:
Build the Valsoft-first backend engine and minimal reviewer-ready API/CLI outputs. The Brim layer should be planned through clean extension points, but not prioritized until the fraud engine is stable.

Non-negotiable challenge requirements:
- Ingest transactions.csv.
- Process all rows.
- Flag suspicious transactions with a score/risk level/ranked list.
- Provide human-readable explanations for every flagged transaction.
- Support reviewer actions: approve, dismiss, escalate, undo.
- Export an updated CSV with fraud/risk columns.
- Produce JSON outputs that the frontend can render directly.
- Add at least one meaningful test.
- Preserve clean engineering structure.
- Add/prepare README, PRD, implementation plan, and hypothesis log docs.

Important dataset fields:
transaction_id, timestamp, card_id, amount, merchant_name, merchant_category, channel, cardholder_country, merchant_country, device_id, ip_address.

Detection strategy:
Implement a transparent layered anomaly engine, not a black-box model.

Final risk score should combine:
- robust per-card behavioral anomaly score
- categorical surprisal score
- graph/cross-card collective anomaly score
- temporal burst/velocity score
- optional global model consensus score using sklearn/PyOD if easy
- reviewer feedback adjustment, if reviewer actions are available in-session

Target scoring shape:
FINAL_SCORE =
  0.30 * CARD_BASELINE_SCORE
+ 0.25 * GRAPH_COLLECTIVE_SCORE
+ 0.20 * TEMPORAL_BURST_SCORE
+ 0.15 * CATEGORICAL_SURPRISE_SCORE
+ 0.10 * MODEL_CONSENSUS_SCORE

Use a default review threshold around the top 8-10% of transactions by risk score. Also expose configurable thresholds:
- conservative: top 3-5%
- balanced: top 8-10%
- aggressive: top 12-15%

Implementation preferences:
- Python backend.
- Use Polars for feature engineering and CSV processing.
- Use Pydantic models for typed JSON contracts.
- Use FastAPI only if an API already exists or is easy to add; otherwise build CLI + JSON outputs first.
- Use scikit-learn IsolationForest / LocalOutlierFactor only as a secondary model-consensus score.
- Use PyOD ECOD/COPOD/HBOS only if installation is straightforward.
- Do not train a neural network.
- Do not implement a full GNN.
- For graph/cross-card fraud, compute explainable graph-derived features with group-bys/window logic.
- NetworkX is optional and should not be required for the core path.
- Keep everything deterministic and reproducible.

Core modules to create or adapt:
src/mimir/
  __init__.py
  core/
    schemas.py
    constants.py
    paths.py
  data/
    load_transactions.py
    validate_transactions.py
  features/
    card_baselines.py
    categorical_surprisal.py
    temporal_velocity.py
    graph_collective.py
    model_consensus.py
    feature_pipeline.py
  scoring/
    normalize.py
    score_engine.py
    reason_engine.py
    thresholds.py
  review/
    review_state.py
    audit_log.py
    feedback.py
  export/
    export_csv.py
    export_json.py
  api/
    main.py
    routes_transactions.py
    routes_review.py
  cli.py

If the repo already has a different structure, adapt to it instead of blindly replacing it. Preserve existing frontend and config files.

Data contracts:
Create a TransactionRisk object like:

{
  "transaction_id": "tx_000123",
  "timestamp": "...",
  "card_id": "...",
  "amount": 123.45,
  "merchant_name": "...",
  "merchant_category": "...",
  "channel": "...",
  "risk_score": 0.91,
  "risk_level": "high",
  "is_flagged": true,
  "recommended_action": "escalate",
  "primary_pattern": "merchant_burst",
  "component_scores": {
    "card_baseline": 0.82,
    "categorical_surprisal": 0.71,
    "temporal_velocity": 0.64,
    "graph_collective": 0.93,
    "model_consensus": 0.55
  },
  "reasons": [
    {
      "code": "NEW_DEVICE_FOR_CARD",
      "severity": "high",
      "message": "First time this card used this device.",
      "evidence": {
        "device_id": "dev_123",
        "card_id": "card_004"
      }
    }
  ],
  "review": {
    "status": "pending",
    "history": []
  }
}

Feature requirements:

1. Card baseline features:
- card_tx_count
- card_median_amount
- card_mad_log_amount
- amount_ratio_to_card_median
- robust_z_log_amount
- category_is_new_for_card
- merchant_is_new_for_card
- device_is_new_for_card
- ip_is_new_for_card
- channel_is_unusual_for_card
- merchant_country_is_unusual_for_card
- country_mismatch

Use log1p(amount). Use robust z:
(log1p(amount) - median_card_log_amount) / (1.4826 * MAD_card_log_amount + epsilon)

2. Categorical surprisal:
Compute smoothed negative log probability for:
- merchant_category | card_id
- merchant_name | card_id
- channel | card_id
- merchant_country | card_id
- device_id | card_id
- ip_address | card_id
- merchant_category + channel + merchant_country combination

Use additive smoothing alpha=1.0.
Output both numeric features and reason codes when surprisal is high.

3. Temporal velocity:
Sort by timestamp. Treat timestamps as UTC.
Compute rolling/window features:
- card_tx_count_10m
- card_tx_count_60m
- card_online_tx_count_60m
- card_small_tx_count_60m
- merchant_tx_count_60m
- merchant_unique_cards_60m
- device_unique_cards_60m
- ip_unique_cards_60m
- same_card_same_merchant_count_60m
- same_card_same_amount_near_duplicate_24h
- split_purchase_suspect: multiple transactions from same card/merchant/category within short window whose sum exceeds a threshold

Keep implementation simple and correct. Polars group_by_dynamic or explicit self-joins are acceptable.

4. Graph/cross-card features:
Do not build a GNN. Build graph-derived signals:
- device_unique_cards_total
- ip_unique_cards_total
- merchant_unique_cards_total
- device_unique_cards_24h
- ip_unique_cards_24h
- merchant_unique_cards_24h
- merchant_burst_score
- shared_device_with_other_cards
- shared_ip_with_other_cards
- unusual_merchant_hit_by_many_cards
- merchant_category_country_cluster_rarity

Reason examples:
- "Device used by 5 different cards."
- "IP address used by 4 different cards."
- "Merchant saw 8 unique cards in 60 minutes."
- "Merchant/category/country combination is rare but appeared repeatedly."

5. Model consensus:
Optional but useful:
- Build numeric feature matrix from engineered features.
- Scale robustly.
- Run IsolationForest and/or LocalOutlierFactor if dependencies are present.
- Convert model scores to 0-1 percentile rank.
- Store as model_consensus score.
- Do not let this be the only explanation.

6. Reason engine:
Every flagged transaction must have at least one reason.
Reasons must be short, human-readable, and backed by exact evidence values.
Create a priority system so the top 3-5 reasons show first.
Avoid vague reasons like "ML model says anomalous."

7. Thresholding:
Implement:
- score_to_risk_level(score): low/medium/high/critical
- threshold_by_review_rate(df, rate)
- threshold_by_cost(false_positive_cost, false_negative_cost), even if simple
- default balanced threshold returning about top 8-10%

8. Reviewer state:
Implement in-memory and file-backed review state:
- pending
- approved
- dismissed
- escalated
- undo last action
- audit log with timestamp, transaction_id, previous_state, new_state, reason/comment optional
- dismissed transaction IDs should be excluded or visually deprioritized in future queue output
- feedback adjustment may be simple: similar transactions to dismissed ones get a small score penalty inside the session

9. Exports:
Create:
- data/processed/transactions_scored.csv
- data/processed/flagged_transactions.csv
- data/processed/review_queue.json
- data/processed/risk_summary.json
- data/processed/hypothesis_log.md if not present

CSV must include:
transaction_id
risk_score
risk_level
is_flagged
primary_pattern
top_reasons
review_status

10. CLI:
Add commands such as:
- python -m mimir.cli score --input data/transactions.csv --out data/processed
- python -m mimir.cli queue --input data/processed/review_queue.json
- python -m mimir.cli review --transaction-id tx_000123 --action escalate
- python -m mimir.cli export --input data/transactions.csv --out data/processed/transactions_scored.csv

If the repo uses uv, make the commands work with uv run.
If it uses npm/pnpm frontend, do not break it.

11. API, if adding FastAPI:
Endpoints:
GET /health
POST /api/score
GET /api/transactions
GET /api/review-queue
POST /api/review/{transaction_id}
GET /api/summary
GET /api/export/csv

12. Frontend integration contract:
Even if frontend is not finished, expose JSON that a frontend can render:
- review queue cards
- transaction detail
- risk summary
- score distribution
- reason breakdown
- merchant/card/device/IP network summaries

13. Brim extension points:
Do NOT fully build Brim in this task, but prepare clean hooks:
- policy_score can be added later beside fraud_score
- approval_recommendation can consume risk_score + policy_score + budget context
- expense_report_group_id can be added later
- natural-language query layer can call precomputed aggregates and return JSON visualization specs

Add a short docs/BRIM_EXTENSION_PLAN.md explaining:
- how policy rules will attach to TransactionRisk
- how approval recommendations reuse the reason engine
- how expense reports group transactions
- how natural-language questions map to aggregate functions and chart specs

14. Tests:
Add tests with small synthetic data:
- normal card behavior should not be flagged high
- new device + large amount + unusual category should be high risk
- shared IP/device across multiple cards should increase graph_collective score
- every flagged transaction has at least one reason
- export files are created

15. Documentation:
Update/create:
README.md
docs/PRD.md
docs/IMPLEMENTATION_PLAN.md
docs/HYPOTHESIS_LOG.md
docs/BRIM_EXTENSION_PLAN.md

README must include:
- what Mimir is
- why Valsoft-first
- how to run
- detection strategy
- what files are generated
- what to demo
- what to build with another week

PRD must include:
- user: fraud/risk reviewer first, finance manager second
- problem
- success criteria
- non-goals
- core workflow

Implementation plan must include:
- architecture
- data flow
- tech choices
- skipped work
- team division placeholders

Hypothesis log must include:
- initial fraud hypotheses
- features/rules tried
- kept/dropped
- notes for demo

Quality bar:
- Prefer simple, transparent, working code over ambitious half-built ML.
- Make the engine inspectable.
- Avoid hidden magic.
- No dead code.
- No notebooks as the only implementation.
- No hardcoded transaction IDs.
- No fake fraud labels.
- No leakage from hidden answer keys.
- Handle missing device_id/ip_address for non-online transactions.
- Ensure output is deterministic.

Acceptance criteria before stopping:
1. The scoring command runs successfully on transactions.csv.
2. Scored CSV and review queue JSON are generated.
3. At least 8-10% of transactions are flagged by default, unless a configured threshold says otherwise.
4. Every flagged transaction has human-readable reasons.
5. There is at least one cross-card signal.
6. There is at least one per-card baseline signal.
7. There is at least one temporal velocity signal.
8. Reviewer actions work through CLI or API.
9. Tests pass.
10. README explains the approach clearly.

After completing Phase 1, provide a concise summary:
- files created/changed
- how to run
- what scoring components exist
- what frontend/API contract is available
- what remains for Brim-specific features
