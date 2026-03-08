Runbook: Validate DB migrations locally with TimescaleDB

Purpose
- Start a local TimescaleDB instance and run the SQL migrations in `db/init` to validate idempotency and Timescale-specific statements.

Prerequisites
- Docker and docker-compose installed locally
- At least 2GB free disk and network access to pull images

Steps
1) From the repo root, start the test TimescaleDB:

```powershell
cd apps/ml-engine
docker-compose -f docker-compose.test-db.yml up -d
```

2) Wait for DB to be healthy (pg_isready). You can watch logs:

```powershell
docker-compose -f docker-compose.test-db.yml logs -f timescaledb
```

3) Export a DATABASE_URL that `run_migrations.py` will use (matches compose):

```powershell
$env:DATABASE_URL = 'postgresql://admin:password@127.0.0.1:5433/dellmology'
```

4) Run the migration runner (it will apply files in `db/init`):

```powershell
cd c:\IDX_Analyst\apps\ml-engine
python scripts/run_migrations.py
```

5) Inspect output for failures. If materialized view or hypertable errors appear, inspect the specific SQL file in `db/init` and adjust as needed.

6) When done, stop and remove the test DB:

```powershell
docker-compose -f docker-compose.test-db.yml down -v
```

MinIO (optional S3 integration)

Audit & RLS migration
----------------------
A new migration `db/init/09-rls-audit.sql` creates an `ml_audit_log` table and a conditional trigger for `ml_models` if that table exists. To inspect audit logs once migrations are applied, you can use the admin API:

```powershell
# list most recent audit entries (use `Authorization: Bearer <token>` or `ADMIN_TOKEN` env)
curl -H "Authorization: Bearer $env:ADMIN_TOKEN" "http://localhost:8000/api/admin/audit?limit=100"

# clear audit entries older than 365 days
curl -X POST -H "Authorization: Bearer $env:ADMIN_TOKEN" "http://localhost:8000/api/admin/audit/clear?older_than_days=365"
```

The API is intentionally small and protected by the same `ADMIN_TOKEN` used for other admin endpoints. You can extend it to add filtering, paging, or export capabilities as needed.

```powershell
cd apps/ml-engine
docker-compose -f docker-compose.test.yml up -d
```

Default MinIO credentials: `minioadmin` / `minioadmin`.

Create a bucket named `test-bucket` in the MinIO web UI (http://localhost:9000) or using the `mc` CLI.

Set environment variables for the ML engine to use MinIO as S3:

```powershell
$env:AWS_ACCESS_KEY_ID='minioadmin'
$env:AWS_SECRET_ACCESS_KEY='minioadmin'
$env:AWS_S3_BUCKET='test-bucket'
# Optional: endpoint override used by the test script
$env:S3_ENDPOINT='http://localhost:9000'
```

Then run the test script:

```powershell
python scripts/test_s3_checkpoint.py
```


Notes
- Some migrations require Supabase-specific roles (`anon`, `service_role`) — the migration runner now guards role-dependent statements, but you may still need to create test roles or adapt policies for your environment.
- If you prefer a clean DB each run, first remove the volume with `docker-compose down -v` to reset state.
- If Docker can't run in your environment, run the migrations against an accessible Postgres/Timescale instance by setting `DATABASE_URL` accordingly.

Supabase persistence
---------------------
If you want the application to integrate with Supabase (for example to use Supabase roles or storage), set the following environment variables before running migrations or starting the API:

```powershell
$env:SUPABASE_URL='https://<your-project>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='<service-role-key>'
```

The migration runner and some RLS policies will detect a Supabase project when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present and may attempt Supabase-specific operations. If you do not provide these, the runner will skip Supabase-only statements.

Contact
- If you want, I can try to start the container here (may be blocked by environment). Otherwise run the above locally and report any failing migration files and I'll patch them for idempotency.
