<#
Run local integration for TimescaleDB + MinIO, migrations, and S3 checkpoint test.

Usage (PowerShell):
  cd apps/ml-engine\scripts
  .\run_local_integration.ps1

Requirements:
  - Docker and Docker Compose available in PATH
  - Optional: `mc` (MinIO client) to create the bucket automatically
#>

$compose = "..\docker-compose.test.yml"
$env:POSTGRES_USER = "admin"
$env:POSTGRES_PASSWORD = "password"
$env:POSTGRES_DB = "dellmology"

Write-Host "Starting test services (TimescaleDB + MinIO)..."
Push-Location ".."
docker compose -f (Split-Path -Leaf $compose) up -d
Pop-Location

function Wait-For-Container($name, $checkCmd, $timeoutSeconds=120) {
    $start = Get-Date
    while ((Get-Date) -lt $start.AddSeconds($timeoutSeconds)) {
        try {
            $out = docker compose -f $compose exec -T $name $checkCmd 2>&1
            if ($LASTEXITCODE -eq 0) { return $true }
        } catch {}
        Start-Sleep -Seconds 3
    }
    return $false
}

Write-Host "Waiting for TimescaleDB to be ready..."
$ready = Wait-For-Container -name "timescaledb" -checkCmd "pg_isready -U $env:POSTGRES_USER -d $env:POSTGRES_DB" -timeoutSeconds 180
if (-not $ready) { Write-Error "TimescaleDB not ready after timeout"; exit 1 }

Write-Host "Waiting for MinIO to be ready..."
$minioReady = Wait-For-Container -name "minio" -checkCmd "curl -sS http://localhost:9000/minio/health/ready || exit 1" -timeoutSeconds 120
if (-not $minioReady) { Write-Warning "MinIO not ready; proceed but S3 steps may fail" }

Write-Host "Running DB migrations..."
$env:DATABASE_URL = "postgresql://$env:POSTGRES_USER:$env:POSTGRES_PASSWORD@localhost:5433/$env:POSTGRES_DB"
python ..\scripts\run_migrations.py
if ($LASTEXITCODE -ne 0) { Write-Error "Migrations failed"; exit 2 }

Write-Host "Ensuring S3 bucket exists (dellmology-test)..."
if (Get-Command mc -ErrorAction SilentlyContinue) {
    mc alias set local http://localhost:9000 minioadmin minioadmin
    mc mb --ignore-existing local/dellmology-test
} else {
    Write-Host "mc not found; create bucket via MinIO UI http://localhost:9000 (user/minioadmin) or install mc"
}

Write-Host "Running S3 checkpoint test..."
$env:AWS_ACCESS_KEY_ID = "minioadmin"
$env:AWS_SECRET_ACCESS_KEY = "minioadmin"
$env:S3_ENDPOINT = "http://localhost:9000"
$env:AWS_S3_BUCKET = "dellmology-test"
python ..\scripts\test_s3_checkpoint.py
if ($LASTEXITCODE -ne 0) { Write-Error "S3 checkpoint test failed"; exit 3 }

Write-Host "Local integration completed successfully."