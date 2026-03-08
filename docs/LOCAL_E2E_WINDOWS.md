Local E2E (Windows) — TimescaleDB + migrations

Purpose
- Steps to run the local TimescaleDB compose and apply migrations on Windows (PowerShell / cmd).
- Troubleshooting tips for common issues (Docker daemon not running, pg_isready not on host, container access).

Prerequisites
- Docker Desktop installed and running (Windows).
- Python 3.10+ and the repository venv activated (optional if running migrations from host).

Quick start (PowerShell)

1. Start Docker Desktop and ensure the engine is running.
2. From repo root:

```powershell
# start TimescaleDB test compose
docker compose -f apps/ml-engine/docker-compose.test-db.yml up -d

# check container status
docker ps --filter name=idx_test_timescaledb --format "{{.Status}}\t{{.Names}}"

# check container logs (last 200 lines)
docker logs idx_test_timescaledb --tail 200
```

3. Run migrations (PowerShell):

```powershell
# set env var for this session and run migration script
$env:DATABASE_URL = 'postgresql://admin:password@localhost:5433/dellmology'
python .\apps\ml-engine\scripts\run_migrations.py
```

Quick start (cmd.exe)

```cmd
set DATABASE_URL=postgresql://admin:password@localhost:5433/dellmology && python apps\ml-engine\scripts\run_migrations.py
```

If you see `pg_isready` errors or the runner times out:
- On Windows the host may not have `pg_isready`. The migration runner attempts to connect directly and will still work once the DB container accepts TCP connections.
- Use `docker logs` to inspect DB startup errors.

Directly inspect DB inside container

```powershell
# connect to 'postgres' DB and list databases
docker exec -it idx_test_timescaledb psql -U admin -d postgres -c "\l"

# create the target DB if missing (container postgres user)
docker exec -it idx_test_timescaledb psql -U admin -d postgres -c "CREATE DATABASE \"dellmology\" OWNER admin;"
```

Alternative: run migration runner inside a transient Python container (isolated from host tools)

```powershell
# example: run the migration script inside a Python container that has network access to the TimescaleDB container
# Note: this assumes the repo is mounted into the container at /workspace
docker run --rm -v ${PWD}:/workspace --workdir /workspace --network host python:3.10-slim pwsh -c "pip install psycopg2-binary sqlalchemy && python apps/ml-engine/scripts/run_migrations.py"
```

Notes & troubleshooting
- If `docker` commands fail with "failed to connect to the docker API" on Windows, ensure Docker Desktop is running and that Windows user has permissions to access the Docker named pipe. Restart Docker Desktop if necessary.
- If the container is `Up` but Postgres responds with `database "dellmology" does not exist`, run the `CREATE DATABASE` command inside the container (see above) or re-run the migration runner (it now attempts to create the DB when missing).
- If `psql` inside the container reports `database "admin" does not exist` when using `-U admin` without `-d postgres`, explicitly set `-d postgres` when running commands.

CI notes
- The CI workflow (`.github/workflows/timescaledb-e2e.yml`) runs TimescaleDB inside the runner and should not exhibit the Windows named-pipe issue. Use the PR-based CI run if local Docker is problematic.

If you'd like, I can also add a short PowerShell script `scripts/start_local_db.ps1` to automate these steps."
