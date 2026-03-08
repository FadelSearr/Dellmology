Recent progress (2026-03-08):
- Ran local integration E2E via `scripts/run_local_e2e.ps1`: `apps/ml-engine` tests executed against the local compose stack — 22 tests passed, 1 skipped.
- Patched `apps/ml-engine/scripts/run_migrations.py` to execute Timescale/PLpgSQL migration files as a single autocommit statement (preserves dollar-quoted DO blocks). Re-ran migrations successfully; Timescale-specific continuous-aggregate statements are skipped when Supabase credentials are not set.
 - Reviewed and updated `ROADMAP_STATUS.md` with current repository findings and timestamp.
CI trigger: bump to re-run migrations smoke (2026-03-08 00:00 UTC)
Recent progress (2026-03-08):
- Added a server-side audit verification API (`GET /api/admin/audit/verify`) and wired it into the admin audit UI (`apps/web/src/app/admin/audit/page.tsx`).
- Added a server-side verification endpoint in `apps/ml-engine/dellmology/api/audit_api.py` and unit tests in `apps/ml-engine/tests/test_audit_verify.py` (passed locally).
- Implemented admin model controls (retrain/promote/status) and server-side proxy routes in `apps/web/src/app/api/ml/*` and UI at `apps/web/src/app/admin/models/page.tsx`.
- Hardened RLS policies with `db/init/13-rls-hardening.sql` and added a CI-friendly RLS presence test `apps/ml-engine/tests/test_rls_policies.py`.
- Improved migration runner (`apps/ml-engine/scripts/run_migrations.py`) to auto-create the target DB if missing.
- Added a PR template `.github/PULL_REQUEST_TEMPLATE.md` to prepare for opening a PR that will trigger the TimescaleDB E2E workflow.

Pending validation:
- TimescaleDB E2E workflow (`.github/workflows/timescaledb-e2e.yml`) pending run on a PR to validate migrations, RLS, and the verification API.
- Local migration readiness still requires Docker daemon availability for full end-to-end checks.
 - PR #2 opened: https://github.com/FadelSearr/Dellmology-pro/pull/2 — TimescaleDB E2E and related CI runs are currently in progress.
 - Update (2026-03-08): PR #2 was merged into `main` after TimescaleDB E2E passed (run ID 22815652423). CI validated migrations, RLS policies, and supabase-marked tests.
 - Added `.env.example` documenting `ML_ENGINE_KEY` and `ADMIN_JWKS_*` settings, created `docs/JWKS_ML_ENGINE_KEY.md`, and updated frontend proxy routes to prefer incoming `Authorization: Bearer <token>` and fall back to `ML_ENGINE_KEY` for local/dev server-to-server calls. Changes committed and pushed to the repo.
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
 - Added an audit verification API and wired it into the admin audit UI so verification results display in `apps/web/src/app/admin/audit/page.tsx`.

Update (2026-03-08, final): CI E2E validation completed and roadmap items verified
- E2E run (compose-e2e) on branch `ci/trigger-e2e` completed successfully (run ID 22816247797). Migrations applied up through `db/init/13-rls-hardening.sql`.
- Backend tests: 26 passed, 1 skipped. Frontend Next.js build: succeeded (static pages generated).
- Changes applied to fix CI failures and finalize roadmap items:
	- `apps/ml-engine/tests/test_rls_policies.py`
	- `apps/web/src/app/admin/audit/page.tsx`
	- `apps/web/src/app/admin/models/page.tsx`
	- `db/init/13-rls-hardening.sql`
	- `.github/workflows/compose-e2e.yml`
	- `.env.example`
	- `docs/JWKS_ML_ENGINE_KEY.md`
- Branch: `ci/trigger-e2e` contains the verification commits. Recommend merging the branch into `main` to finalize roadmap changes and enable the E2E CI gating for future PRs.
- Next recommended actions: merge the `ci/trigger-e2e` PR (or request review), then optionally run a post-merge smoke check: run the CI compose-E2E again or run `apps/ml-engine` tests locally against `docker-compose.test-db.yml`.

If you want, I can open or merge the PR now — tell me to (A) open PR, (B) merge PR, or (C) stop here.

Next recommended steps:
- Validate Supabase RLS & continuous-aggregate policies once `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available.
- Add a CI `docker-compose` E2E job that mirrors `scripts/run_local_e2e.ps1` for PR gating.
- Optional: add lightweight CI smoke for the `screener` and `promotion` pages (headless browser or playwright) to catch runtime regressions.

Local verification (2026-03-08, continued):
- **Backend tests:** 35 passed, 2 skipped (local run in `apps/ml-engine`).
- **Frontend build:** Next.js production build succeeded; static pages generated (admin UI routes present).
- **Maintenance smoke:** exercised `GET /api/maintenance/rls-smoke` (returned `roles: ["anon","service_role"]`, many tables show `rowsecurity: true`) and `POST /api/maintenance/refresh-aggregates` (attempted `CALL refresh_continuous_aggregate` for configured views). Several refresh attempts returned "relation ... does not exist" for materialized views absent in the local test DB — this is expected on a minimal local stack; calls are handled and reported per-view.
- **Model status (local):** champion present (`champion_v1`), no challenger, `retrain_running: false`.

Recommendations: merge verification branch (`ci/trigger-e2e`) into `main` when ready, then run an automated compose-E2E CI run or repeat local `docker-compose.test-db.yml` + `scripts/run_migrations.py` to validate Supabase/Timescale-specific artifacts in a fully provisioned environment.

Recent addition (evaluation persistence):
- **Persist evaluations:** Scheduled evaluations now persist results to `public.ml_model_evaluations` (best-effort; table optional) when available.
- **UPS event:** Each evaluation writes a UPS event to `apps/ml-engine/logs/ups_events.jsonl` so downstream notifiers (UPS/Telegram) can pick up evaluation outcomes.
 
Release & CI updates (2026-03-08):
- Created release PR branch `release/v2.0.0` with `RELEASE_PR.md` summarizing v2.0.0 changes.
- Draft GitHub Release created from tag `v2.0.0` (review link printed in CI logs).
- Added Telegram notifier and test scripts (`apps/ml-engine/scripts/send_telegram_test.py`, `apps/ml-engine/scripts/test_evaluate_notify.py`).
- Added GitHub Actions workflows for on-demand tests:
	- `.github/workflows/telegram-e2e.yml` — manual Telegram test (requires `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` secrets).
	- `.github/workflows/evaluate-promote-e2e.yml` — manual evaluate/promote E2E against `ML_ENGINE_URL` (requires `ML_ENGINE_KEY` or `ADMIN_TOKEN`).

These additions enable safe, manual verification of notification paths and evaluate/promote orchestration in CI while keeping production secrets out of the repository.
