# ROADMAP Implementation Status

Ringkasan status implementasi roadmap terhadap kode yang ada di repository saat ini (per 2026-03-07).

Implemented (in repo):
- Core real-time streamer (Go) and SSE endpoints — `apps/streamer` exists.
- Frontend Next.js dashboard skeleton and many UI components in `apps/web` (charts, sections, tables).
- ML engine with trainer + inference stubs (`apps/ml-engine/train_or_stub.py`, `inference_server.py`) and `train_and_eval.py` for metrics.
- CI workflows for ML smoke tests and training (`.github/workflows/ci-ml.yml`) — trains/stubs and uploads artifacts.
- Model metrics generation and storage as local artifact (`apps/ml-engine/model_metrics.json`) and web API/UI pages for metrics (`apps/web/src/app/api/model-metrics/route.ts`, `apps/web/src/app/ml/metrics/page.tsx`).
- Broker flow UI + table components and negotiated market monitor UI (`BrokerFlowTable`, `NegotiatedMarketMonitor`).

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

If kamu setuju, saya bisa lanjut: 1) mengaktifkan Supabase persistence ketika kredensial tersedia, 2) menambahkan RLS skeleton and audit logging, atau 3) lanjut implementasi fitur roadmap berikutnya yang kamu minta. Pilih nomor atau beri instruksi.
