Local end-to-end (E2E) helper
===============================

Purpose
-------
Quick reference for running the local end-to-end flow for `apps/ml-engine` which uses a test Postgres/Timescale and MinIO (S3-compatible) provided by the repository's docker-compose test file.

Run the helper
--------------
From repository root in PowerShell:

```powershell
./scripts/run_local_e2e.ps1
```

What the script does
---------------------
- Brings up `apps/ml-engine/docker-compose.test.yml` (Postgres + MinIO)
- Waits for Postgres to be reachable on port 5433
- Runs `apps/ml-engine/scripts/run_migrations.py`
- Calls `apps/ml-engine/scripts/create_s3_bucket.py` if present
- Runs pytest for `apps/ml-engine/tests`

Important environment variables
-------------------------------
- `DATABASE_URL` — optional; default used by the script: `postgresql://admin:password@127.0.0.1:5433/dellmology`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `AWS_S3_BUCKET` — used by MinIO/S3 helpers (if present)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — provide these only if you want Supabase persistence and Supabase-only migrations to run.

Notes
-----
- Supabase integration is optional. The migration runner and tests will skip Supabase-only steps when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not set.
- Running the full E2E requires Docker and Python available in your environment.
