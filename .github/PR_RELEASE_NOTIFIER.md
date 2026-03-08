<!-- PR Title -->
Release: Notifier + Migrations improvements (2026-03-09)

<!-- PR Body: use or paste into the GitHub PR description -->
Summary
-------
This PR contains the notifier (Telegram) implementation and supporting infrastructure changes for migrations and CI diagnostics. Key changes:

- Implemented UPS-based Telegram notifier with file-tail loop and debug logging.
- Added `TelegramService` unit test and an E2E mock harness (`notifier_e2e.py`).
- Hardened DB migrations runner (`run_migrations.py`) with Timescale/Supabase heuristics.
- Added RLS smoke checks and a smoke insert script to validate evaluation persistence.
- Fixed scheduler start/stop race conditions and added scheduler tests.
- CI improvements: `migrations-smoke` and `notifier-e2e` workflows now include diagnostics, artifact uploads, unit test step, scheduled runs, and push triggers for `release/**` and `ci/**`.

Files of note
-------------
- `apps/ml-engine/dellmology/telegram/notifier.py`
- `apps/ml-engine/dellmology/telegram/telegram_service.py`
- `apps/ml-engine/scripts/notifier_e2e.py`
- `apps/ml-engine/tests/test_telegram_service.py`
- `apps/ml-engine/scripts/run_migrations.py`
- `db/init/14-ml-model-evaluations.sql` (migration, if present)
- `.github/workflows/notifier-e2e.yml` (updated)
- `.github/workflows/migrations-smoke.yml` (updated)
- `apps/ml-engine/NOTIFIER_RUN.md` (run & debug guide)
- `RELEASE_DRAFT.md` (release notes draft)

Testing
-------
- Unit tests: `apps/ml-engine/tests/test_telegram_service.py` added; local test run: 41 passed, 1 skipped.
- E2E: `scripts/notifier_e2e.py` exercised locally against a mock server; debug logs written to `apps/ml-engine/logs/notifier_debug.log`.
- Migrations smoke scripts executed locally to validate behavior.

How to review
-------------
1. Run unit tests locally: `cd apps/ml-engine && python -m pytest -q tests/test_telegram_service.py -q`
2. Run E2E locally: `python -u apps/ml-engine/scripts/notifier_e2e.py` and inspect `apps/ml-engine/logs/notifier_debug.log`.
3. Check CI workflows under `.github/workflows` (notifications and artifact uploads are included).

Notes
-----
- The notifier E2E workflow is scheduled daily and triggers on pushes to `release/**` and `ci/**` branches.
- If you'd like, I can open the PR via the GitHub API (requires a token), or you can paste this file into the PR body when creating it via the GitHub UI.
