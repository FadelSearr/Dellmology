Summary
-------
This PR implements roadmap work for core infra, migrations, CI, and intelligence UX. Primary focus areas:

- Robust DB migration runner (`apps/ml-engine/scripts/run_migrations.py`) with autocommit fallback and safe SQL splitting for Timescale/PLpgSQL.
- Guarded Supabase RLS skeleton migration (`db/init/10-rls-skeleton.sql`).
- CI workflow to run DB migrations (`.github/workflows/migrations.yml`).
- ML engine: scheduled auto-promote job and XAI enhancements (`apps/ml-engine/main.py`, `dellmology/intelligence/api.py`).
- AI Narrative: added detailed adversarial narrative endpoint and frontend wiring (`/xai/narrative_detailed`, `apps/web/src/components/intelligence/AINarrativeDisplay.tsx`).
- Frontend screener UI improvements (modes + custom price range) and tests.

Files changed (high level)
-------------------------
- apps/ml-engine/scripts/run_migrations.py (new/rewritten)
- db/init/06-performance-aggregates.sql (Timescale aggregate fixes)
- db/init/10-rls-skeleton.sql (SUPABASE-ONLY guarded)
- apps/ml-engine/main.py (scheduler + endpoints)
- apps/ml-engine/dellmology/intelligence/api.py (new detailed narrative endpoint)
- apps/web/src/components/intelligence/AINarrativeDisplay.tsx (wired to detailed endpoint with fallback)
- apps/web/src/app/screener/page.tsx (advanced screener UI)
- .github/workflows/migrations.yml (CI)

Tests
-----
- Backend (ml-engine): 32 passed, 1 skipped (local pytest)
- Frontend: 20 test suites, 51 tests passed (local `npm test`)
- Local E2E: ml-engine E2E passed (22 passed, 1 skipped)

Checklist for PR
----------------
- [ ] CI runs and migrations workflow passes on GitHub Actions
- [ ] Review SQL migration ordering and Supabase-only guards
- [ ] Confirm E2E runner uses the repository Python venv for `boto3` availability
- [ ] Optional: wire AI Narrative panel to show adversarial UI toggles (UX)

Notes
-----
- I could open the PR automatically if you provide a GitHub token with repo access; otherwise paste this description into the PR UI.
- I updated `AINarrativeDisplay.tsx` to prefer `/api/xai/narrative_detailed` and fall back to `/api/narrative`.
- Some tests emit React `act(...)` warnings; they don't fail but may be worth addressing in follow-ups.

Next suggested actions
----------------------
1. Open PR for branch `feat/roadmap-migrations-ci` and request CI run.
2. After CI passes, merge and monitor migrations workflow on GitHub.
3. Optionally, I can open the PR for you if you provide a token or grant permission.

