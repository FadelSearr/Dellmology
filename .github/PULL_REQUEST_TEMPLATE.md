## Summary

This PR implements multiple roadmap items on the `feat/roadmap-status-update` branch:

- Add runtime config immutable-audit verification API and server/UI wiring
- Add admin UI for model retrain/promote/status and proxy routes
- Harden RLS policies via `db/init/13-rls-hardening.sql`
- Add unit tests for audit verification and CI-friendly RLS policy checks
- Improve migration runner to auto-create target DB when missing

## How to validate

1. CI (recommended): open PR to trigger `.github/workflows/timescaledb-e2e.yml` which will run migrations and RLS checks.
2. Local (developer): start Docker Desktop / Docker daemon, then run:

```bash
docker compose -f apps/ml-engine/docker-compose.test-db.yml up -d
export DATABASE_URL=postgresql://admin:password@localhost:5433/dellmology
python apps/ml-engine/scripts/run_migrations.py
pytest -q apps/ml-engine/tests/test_rls_policies.py
```

## Notes for reviewers

- The `ML_ENGINE_KEY`/`NEXT_PUBLIC_ADMIN_TOKEN` are intentionally not added to the repo. The web frontend proxies admin calls to the ML engine; set env vars in CI or in your local `.env` when testing.
- The RLS policies are conservative; review `db/init/13-rls-hardening.sql` and adapt `jwt.claims` expectations to your auth provider if needed.
