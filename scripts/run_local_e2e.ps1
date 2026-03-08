<#
Run local end-to-end environment for ml-engine:
- starts docker-compose for test DB + MinIO
- waits for Postgres to accept connections
- runs migrations
- ensures MinIO bucket if helper exists
- runs the ml-engine pytest suite

Run from repository root in PowerShell:
  ./scripts/run_local_e2e.ps1

Requires: Docker Compose, Python (venv OK), and optional MinIO/Supabase credentials.
#>

Set-StrictMode -Version Latest
Write-Host "Starting local E2E: docker-compose, migrations, MinIO, tests"

$composeFile = "apps/ml-engine/docker-compose.test.yml"
if (-not (Test-Path $composeFile)) {
  Write-Error "Compose file not found: $composeFile"
  exit 1
}

Write-Host "Bringing up compose stack..."
docker compose -f $composeFile up -d

# Wait for Postgres on port 5433
Write-Host "Waiting for Postgres to accept connections on 127.0.0.1:5433..."
$maxAttempts = 60
$attempt = 0
while ($attempt -lt $maxAttempts) {
  $attempt++
  # Prefer Test-NetConnection when available (Windows), otherwise use a TcpClient fallback (cross-platform pwsh)
  $conn = $null
  if (Get-Command -Name Test-NetConnection -ErrorAction SilentlyContinue) {
    $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port 5433 -WarningAction SilentlyContinue
    if ($conn -and $conn.TcpTestSucceeded) { break }
  } else {
    try {
      $tcp = New-Object System.Net.Sockets.TcpClient
      $async = $tcp.BeginConnect('127.0.0.1', 5433, $null, $null)
      $wait = $async.AsyncWaitHandle.WaitOne(1000)
      if ($wait -and $tcp.Connected) { $tcp.EndConnect($async); $tcp.Close(); break }
      $tcp.Close()
    } catch {
      # ignore and retry
    }
  }
  Start-Sleep -Seconds 2
}
if ($attempt -ge $maxAttempts) {
  Write-Error "Postgres did not become reachable after waiting."
  exit 2
}

Write-Host "Postgres is up. Running migrations..."

# Ensure a reasonable DATABASE_URL is set for migrations if not provided
if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = 'postgresql://admin:password@127.0.0.1:5433/dellmology'
  Write-Host "Set default DATABASE_URL for local E2E"
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Error "Python not found in PATH. Activate your venv or install Python."
  exit 3
}

Write-Host "Running migrations via scripts/run_migrations.py"
python apps/ml-engine/scripts/run_migrations.py

# Create MinIO bucket if helper exists
$createBucketScript = 'apps/ml-engine/scripts/create_s3_bucket.py'
if (Test-Path $createBucketScript) {
  Write-Host "Ensuring S3/MinIO bucket exists (running $createBucketScript)"
  python $createBucketScript
} else {
  Write-Host "No create_s3_bucket.py script found; skipping MinIO bucket creation step."
}

Write-Host "Running ml-engine tests (pytest)"
python -m pytest -q apps/ml-engine/tests

Write-Host "Local E2E script finished. If you need Supabase E2E, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and re-run the relevant tests." 
