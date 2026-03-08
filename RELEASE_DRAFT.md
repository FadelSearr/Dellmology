# Release Draft — Notifier & Migrations Work

Date: 2026-03-09

Summary
-------
- Implemented Telegram UPS-based notifier with unit and E2E (mock) tests.
- Hardened DB migrations runner and added `db/init/14-ml-model-evaluations.sql` migration.
- Added RLS smoke checks and smoke insert scripts to validate evaluate→promote persistence.
- Fixed scheduler start/stop race conditions and added scheduler tests.
- Added an admin UI unit test for audit page rendering.
- CI improvements: migrations smoke workflow diagnostics, notifier-e2e workflow with artifacts upload and scheduled runs, and a focused unit test for `TelegramService`.

Files / Changes of Note
-----------------------
- apps/ml-engine/dellmology/telegram/notifier.py — UPSNotifier with file-tail loop; debug logging to `apps/ml-engine/logs/notifier_debug.log`.
- apps/ml-engine/dellmology/telegram/telegram_service.py — debug instrumentation for HTTP POST attempts.
- apps/ml-engine/scripts/notifier_e2e.py — local E2E harness (mock Telegram server).
- apps/ml-engine/tests/test_telegram_service.py — unit test for `TelegramService` using a local mock HTTP server.
- apps/ml-engine/tests/test_notifier.py — notifier unit test (existing/updated).
- apps/ml-engine/scripts/run_migrations.py — hardened migration runner with Timescale/Supabase heuristics.
- db/init/14-ml-model-evaluations.sql — migration for model evaluation persistence (if present in branch).
- .github/workflows/notifier-e2e.yml — uploads artifacts and runs unit test + E2E; scheduled daily.
- .github/workflows/migrations-smoke.yml — improved diagnostics and artifact uploads.
- apps/ml-engine/NOTIFIER_RUN.md — run & debug guide for notifier locally and CI.

Tests & Local Verification
--------------------------
- `apps/ml-engine` test suite: verified locally (41 passed, 1 skipped in my environment).
- New `test_telegram_service.py` passes locally.
- Ran `rls_smoke_check.py` and `smoke_insert_evaluation.py` locally to reproduce CI smoke behaviour.

CI & Release Steps
------------------
1. Ensure `ci/migrations-smoke` workflow runs green and artifacts are inspected for any failures. Artifacts now include `notifier-logs.tar.gz` and `workspace.tar.gz`.
2. Merge `ci/migrations-smoke` branch into `main` (or create a release branch) when CI is green.
3. Bump repository version (tag) — suggested tag: `v0.9.0-notifier` or follow existing versioning convention.
4. Create a GitHub release with the tag and include this summary; attach artifact links if useful.

How to run locally (quick)
--------------------------
Run unit test:

```bash
cd apps/ml-engine
python -m pip install -r requirements.txt
python -m pytest -q tests/test_telegram_service.py -q
```

Run E2E harness:

```bash
cd apps/ml-engine
python -u scripts/notifier_e2e.py
tail -n 200 logs/notifier_debug.log
```

Notes / Next Steps
-----------------
- Optionally add a `push` trigger to `notifier-e2e.yml` for branch-based runs.
- Consider adding a lightweight integration test in CI that posts a synthetic UPS event and asserts DB insertion (requires DB in CI).
- Finalize release notes and tag once `ci/migrations-smoke` and notifier E2E are stable in Actions.

Prepared by: GitHub Copilot (local agent)
