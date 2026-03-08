<##
# Start Local TimescaleDB for E2E and run migrations/tests (Windows PowerShell)
#
# Usage: Open PowerShell as Administrator and run:
#   .\scripts\start_local_db.ps1
#
# This script will:
# - Ensure Docker is available
# - Start the test compose `apps/ml-engine/docker-compose.test-db.yml`
# - Wait for the `idx_test_timescaledb` container to become healthy
# - Run the migration runner and the RLS presence pytest
##>

function Write-ErrAndExit($msg) {
    Write-Host "ERROR: $msg" -ForegroundColor Red
    exit 1
}

# Check docker
try {
    docker version > $null 2>&1
} catch {
    Write-ErrAndExit "Docker does not appear to be running or is not on PATH. Start Docker Desktop and try again."
}

# Start compose
Write-Host "Starting TimescaleDB compose..."
docker compose -f apps/ml-engine/docker-compose.test-db.yml up -d

$containerName = 'idx_test_timescaledb'

# Wait for container to start and become healthy
$maxTries = 60
$i = 0
while ($i -lt $maxTries) {
    $i++
    $status = docker inspect --format='{{.State.Health.Status}}' $containerName 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Waiting for container to appear... ($i/$maxTries)"
        Start-Sleep -Seconds 3
        continue
    }
    if ($status -eq 'healthy') {
        Write-Host "Container $containerName is healthy"
        break
    }
    if ($status -eq 'unhealthy') {
        Write-Host "Container reported unhealthy; showing last 200 logs"
        docker logs $containerName --tail 200
        Write-ErrAndExit "Container unhealthy. Check logs above."
    }
    Write-Host "Container health: $status ($i/$maxTries)"
    Start-Sleep -Seconds 3
}
if ($i -ge $maxTries) {
    Write-ErrAndExit "Timed out waiting for $containerName to become healthy"
}

# Set DATABASE_URL for this PowerShell session
$env:DATABASE_URL = 'postgresql://admin:password@localhost:5433/dellmology'
Write-Host "Running migrations against $env:DATABASE_URL"
python .\apps\ml-engine\scripts\run_migrations.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Migrations may have failed. Check output above."
} else {
    Write-Host "Migrations completed (or skipped where appropriate)."
}

# Run the CI-friendly RLS test (skip if DB not configured)
Write-Host "Running RLS presence test (will skip if DATABASE_URL not reachable)..."
python -m pytest -q apps/ml-engine/tests/test_rls_policies.py || Write-Host "RLS test finished (check output)."

Write-Host "Done. You can now run the web dev server or interact with the ML engine."
Write-Host "To stop the test DB: docker compose -f apps/ml-engine/docker-compose.test-db.yml down"
