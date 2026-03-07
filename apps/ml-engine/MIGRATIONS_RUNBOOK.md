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

Notes
- Some migrations require Supabase-specific roles (`anon`, `service_role`) — the migration runner now guards role-dependent statements, but you may still need to create test roles or adapt policies for your environment.
- If you prefer a clean DB each run, first remove the volume with `docker-compose down -v` to reset state.
- If Docker can't run in your environment, run the migrations against an accessible Postgres/Timescale instance by setting `DATABASE_URL` accordingly.

Contact
- If you want, I can try to start the container here (may be blocked by environment). Otherwise run the above locally and report any failing migration files and I'll patch them for idempotency.
