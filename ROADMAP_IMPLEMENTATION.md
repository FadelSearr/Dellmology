# Roadmap Implementation Notes — Progress (2026-03-10)

This file maps the high-level items in `ROADMAP.md` to current repository status,
what I've implemented so far, and recommended next actions.

## Completed / Present
- Monitoring & CI: `.github/workflows/pr-monitor.yml` — telemetry listing added; placeholder artifact handling present.
- Streamer (Go): SSE worker and data ingestion skeleton in `apps/streamer` (SSE broker, HTTP server, Redis fallback). Added `validator` for HAKA/HAKI and wired it into `internal/data/streaming.go`.
- ML Engine: lightweight Keras model scaffold in `apps/ml-engine/keras_model.py` (runs without TF), backtest runner in `apps/ml-engine/dellmology/backtest/backtest_runner.py`.
- Frontend: Bento Grid and dashboard skeleton exist under `apps/web/src/components/dashboard` and related sections.
- CI artifacts: monitor workflow dispatch and artifact packaging verified (run 22889505455 produced placeholder artifact).

## Implemented in this session
- Added `.env.example` for local development.
- Added `apps/streamer/internal/validator` (HAKA/HAKI detector scaffold) and unit tests.
- Wired the validator into `apps/streamer/internal/data/streaming.go` and added an integration test.
- Validated and pushed changes to branch `feat/roadmap-core-infra-2026-03-09`.

## Next recommended steps (short-term)
1. Expand Streamer ingestion to persist raw ticks into TimescaleDB (schema under `db/init/`).
2. Add light-weight integration test that runs streamer against a mocked websocket feed.
3. Add small training harness that can run in CI using synthetic data (no TF required) and upload model artifacts to S3 or local artifacts dir.
4. Add End-to-End smoke test that exercises monitor workflow to ensure artifact telemetry remains stable.

## Where code was changed in this session
- `.github/workflows/pr-monitor.yml` — telemetry listing before packaging.
- `.env.example` — local env sample.
- `apps/streamer/internal/validator/validator.go` — HAKA/HAKI scaffold.
- `apps/streamer/internal/validator/validator_test.go` — unit test.
- `apps/streamer/internal/data/streaming.go` — attached aggression label to trades.
- `apps/streamer/internal/data/streaming_test.go` — integration test.

## How I will proceed when you say "lanjut berdasarkan roadmap"
- Implement Streamer -> TimescaleDB persistence + migrations.
- Expand ingestion validators and add dead-letter handling.
- Add minimal synthetic-training pipeline in `apps/ml-engine/train_cnn.py` (non-TF fallback available).
- Create a small Frontend PR preview deployment workflow (optional) and document run steps.

If you'd like me to continue, I'll start by adding DB persistence (migration SQL + small Go storage helper) and tests. Reply "lanjut" to proceed.
