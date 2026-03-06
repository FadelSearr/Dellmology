# ROADMAP → Code Mapping (summary)

This file maps ROADMAP features to repository locations and a short status (Implemented / Partial / Missing).

- Core Infrastructure & Data Engine
  - SSE / Real-time stream: Partial — frontend health & SSE UI: `apps/web/src/components/sections/Section0_CommandBar.tsx`
  - TimescaleDB: Implemented (docker-compose + init scripts): `docker-compose.yml`, `db/init/06-performance-aggregates.sql`
  - Data Integration / Retry / Backoff: Partial — `apps/streamer` referenced in README and logs
  - Data Integrity Shield / Rate-Limit: Missing (design notes present in `ROADMAP.md`).

- Advanced Analysis Engines
  - Deep CNN Technical: Partial — scaffold & training/inference scripts: `apps/ml-engine/keras_model.py`, `apps/ml-engine/train_or_stub.py`, `apps/ml-engine/inference_server.py` (.github CI smoke present)
  - Z-Score / Bandarmology: Partial — tests in `apps/ml-engine/tests` (e.g. `test_broker_flow.py`), endpoints documented in `README.md`
  - Order Flow Heatmap: Partial — frontend placeholders and DB rollups referenced (`apps/web` components, `db/init`)
  - Wash Sale Detection: Missing / planned (notes in `ROADMAP.md`)

- Integrated Intelligence
  - AI-Screener (Daytrade/Swing/Custom): Partial — frontend placeholders (`apps/web`), tests in ml-engine exist (scanner tests)
  - Unified Power Score (UPS): Partial / stub — UI mentions and rollup SQL, engine not fully implemented
  - AI Narrative (Gemini): Partial — `apps/ml-engine/intelligence/ai_narrative.py` exists but uses deprecated package; production integration not completed
  - Whale Identity Clustering: Missing/partial (design present, some tests for clustering/exit detection exist)

- Signal, Execution & Risk
  - Exit Whale & Liquidity Hunt: Partial — tests and logic scaffolds exist in `apps/ml-engine/exit_whale.py` (`ml-engine/exit_whale.py`)
  - Volatility-Adjusted Position Sizing (ATR): Missing (UI has Smart Position bar, but engine not implemented)
  - Telegram notifications & action dock: Partial — `Section4_RiskDock.tsx` UI, `scripts/local_telegram_webhook.js`, docker env vars and README references

- Performance, Security & Evaluation
  - Automated Backtesting Rig & XAI: Partial — `apps/web` BacktestRunner UI and ml-engine backtesting stubs; XAI not fully implemented
  - Performance dashboard & real-price tracking: Partial — Grafana skeleton under `monitoring/grafana/dashboard.json`
  - Security layer & RLS: Missing (notes present; `.env.example` shows Supabase usage)

## Quick status

- Files/areas to inspect next: `apps/streamer`, `apps/ml-engine`, `apps/web/src/components/sections`, `db/init`
- Current overall status: many core pieces scaffolded and tested (ML engine, streamer, frontend placeholders). Several advanced features (wash-sale detection, UPS engine, full Gemini integration, production CNN model) are partial or missing.

## Next recommended steps

1. Run full test-suite (done) and fix any remaining import/path issues (conftest added).
2. Prioritise one feature to complete (suggest: Z-Score pipeline → wash-sale detection → UPS aggregation).
3. Implement Data Integrity Shield and message broker for stable ingestion.
