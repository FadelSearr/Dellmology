# ROADMAP Implementation Status

Ringkasan status implementasi roadmap terhadap kode yang ada di repository saat ini (per 2026-03-08).

Implemented (in repo):
- Core real-time streamer (Go) and SSE endpoints — `apps/streamer` exists.
- Frontend Next.js dashboard skeleton and many UI components in `apps/web` (charts, sections, tables).
- ML engine with trainer + inference stubs (`apps/ml-engine/train_or_stub.py`, `inference_server.py`) and `train_and_eval.py` for metrics.
- CI workflows for ML smoke tests and training (`.github/workflows/ci-ml.yml`) — trains/stubs and uploads artifacts.
- Model metrics generation and storage as local artifact (`apps/ml-engine/model_metrics.json`) and web API/UI pages for metrics (`apps/web/src/app/api/model-metrics/route.ts`, `apps/web/src/app/ml/metrics/page.tsx`).
- Broker flow UI + table components and negotiated market monitor UI (`BrokerFlowTable`, `NegotiatedMarketMonitor`).
 - XAI / AI Narrative API routes and ML engine proxy added (`apps/ml-engine/dellmology/intelligence/api.py`, registered in `apps/ml-engine/main.py`).
 - XAI / AI Narrative API routes and ML engine proxy added (`apps/ml-engine/dellmology/intelligence/api.py`, registered in `apps/ml-engine/main.py`).
 - Order Flow Heatmap aggregation worker and anomaly detector initialization in streamer (`apps/streamer/order_flow.go`, `apps/streamer/main.go`).
 - Order Flow Heatmap aggregation worker and anomaly detector initialization in streamer (`apps/streamer/order_flow.go`, `apps/streamer/main.go`).
 - Proxied AI Narrative generation through ML engine: web now forwards narrative requests to ML engine `/xai/narrative` to centralize Gemini usage (`apps/web/src/app/api/generate-narrative/route.ts`).
 - ML model registry migration and basic persistence: `db/init/06-ml-models.sql` added and `dellmology.models.model_registry` updated to persist champion/challenger metadata when DB is available.
 - ML model registry migration and basic persistence: `db/init/06-ml-models.sql` added and `dellmology.models.model_registry` updated to persist champion/challenger metadata when DB is available.
 - Unit tests for `ModelRegistry` retrain and promotion behavior added and passing (`apps/ml-engine/tests/test_model_registry.py`).

Partially implemented / Needs credentials or hardening:
- TimescaleDB / Supabase persistence: DB migrations exist (`db/init/*.sql`) but live persistence requires service URL / service role key.
- Auth & security: simple header-based admin keys are present as placeholders; roadmap recommends RLS and stronger access control — pending.
- Full TensorFlow training in CI: optional job exists but heavy TF runs require CI resources and are not enabled by default.

Removed (per recent cleanup requested):
- Snapshot API & filesystem fallback (`/api/snapshot`) — removed to align strictly with roadmap.
- Local Telegram webhook helper and local E2E test script — removed.
- CI optional POST back to dashboard step — removed.

Not implemented / Missing (roadmap items not yet present):
- Full AI Narrative integration (Gemini prompts + XAI wrappers) — UI placeholders exist but production prompt integration not implemented.
- Order Flow Heatmap engine and persistent high-frequency aggregation with Timescale continuous aggregates (design references exist but full implementation incomplete).
- Automated retraining scheduler with production-grade checkpointing and backtesting rig (parts exist but full rig and nightly jobs not finalized).
- Advanced risk controls like Kill-Switch, immutable audit log hashing, and full Champion-Challenger model orchestration.

Notes & Next Steps:
- To enable DB persistence and metrics centralization: provide `SUPABASE_URL` and service role key; then tests/migrations can be run.
- To enable production Telegram alerts: provide `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` and optionally reintroduce safe test harness separate from production code.
- Security hardening: replace header-based admin keys with token-based auth, enforce RLS on Supabase, and add audit logging for destructive endpoints.

Recent progress (2026-03-07):
- Added unit tests for `ModelRegistry` retrain and promotion; tests run locally and passed.
- Updated `apps/ml-engine` to include a simple background retrain runner and exposed endpoints for status/retrain/promote.
 - Implemented trade-level backtester (slippage, commission, position sizing) in `apps/ml-engine/dellmology/backtest/backtest_runner.py`.
 - Updated promotion gating to use trade-level metrics and a minimum trade count (`PROMOTE_MIN_TRADES`) in `apps/ml-engine/main.py` and `apps/ml-engine/config.py`.
 - Hardened migration runner to execute materialized-view SQL with autocommit and made `db/init/06-performance-aggregates.sql` idempotent for Timescale continuous aggregates.
 - Added MinIO + Timescale compose for local integration testing: `apps/ml-engine/docker-compose.test.yml`.
 - Added `apps/ml-engine/scripts/test_s3_checkpoint.py` to validate checkpoint uploads against MinIO.
 - Updated migration runbook `apps/ml-engine/MIGRATIONS_RUNBOOK.md` with MinIO instructions.
 - Updated web UI for model management to support backtest gating and display backtest metrics: `apps/web/src/app/ml/models/page.tsx`.

Next immediate tasks:
- Add a small web UI for model promotion and retrain controls (planned).
- Update roadmap status in Git and create a small commit (this file).

Recent next steps (recommended):
- Run `docker-compose.test-db.yml` locally to start a TimescaleDB instance and execute `apps/ml-engine/scripts/run_migrations.py` to validate migrations end-to-end.
- Continue hardening remaining `db/init/*.sql` files for idempotency and Timescale-specific constraints (materialized views, hypertable unique-index rules).
- Verify S3 checkpoint uploads end-to-end when `AWS_S3_BUCKET` and credentials are available.

Update (2026-03-07):
- Ran the `apps/ml-engine` unit tests locally — all `apps/ml-engine` tests passed in this run.
- Added a short plan to introduce an RLS skeleton and audit-trigger migrations; next step is to implement these migrations and a small API for audit log management.

Next actions taken (planned): implement RLS skeleton and audit triggers, then update migrations and docs. Run the local integration (TimescaleDB + MinIO) after migrations.

If kamu setuju, saya bisa lanjut: 1) mengaktifkan Supabase persistence ketika kredensial tersedia, 2) menambahkan RLS skeleton and audit logging, atau 3) lanjut implementasi fitur roadmap berikutnya yang kamu minta. Pilih nomor atau beri instruksi.

Recent progress (2026-03-08):
- Ran local integration E2E via `scripts/run_local_e2e.ps1`: `apps/ml-engine` tests executed against the local compose stack — 22 tests passed, 1 skipped.
- Patched `apps/ml-engine/scripts/run_migrations.py` to execute Timescale/PLpgSQL migration files as a single autocommit statement (preserves dollar-quoted DO blocks). Re-ran migrations successfully; Timescale-specific continuous-aggregate statements are skipped when Supabase credentials are not set.
- Ran frontend unit/smoke tests in `apps/web` — installed missing test dependency and executed the test suite: 20 test suites passed (51 tests total).
- Reviewed and updated `ROADMAP_STATUS.md` with current repository findings and timestamp.

Next recommended steps:
- Validate Supabase RLS & continuous-aggregate policies once `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available.
- Add a CI `docker-compose` E2E job that mirrors `scripts/run_local_e2e.ps1` for PR gating.
- Optional: add lightweight CI smoke for the `screener` and `promotion` pages (headless browser or playwright) to catch runtime regressions.
