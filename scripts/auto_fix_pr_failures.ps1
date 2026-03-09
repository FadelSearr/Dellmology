param(
    [int]$PrNumber = 11,
    [string]$RepoRoot = "$(Get-Location)",
    [string]$Branch = "feat/roadmap-core-infra-2026-03-09"
)

Function New-FileIfMissing {
    param($Path, $Content)
    if (-not (Test-Path $Path)) {
        $dir = Split-Path $Path -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Set-Content -Path $Path -Value $Content -Force
        return $true
    }
    return $false
}

Write-Output "Auto-fix runner starting for PR #$PrNumber on branch $Branch"

# Ensure logs are present
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/monitor_pr_runs.ps1 -PrNumber $PrNumber -Limit 50

$logDir = Join-Path $RepoRoot "pr-logs"
if (-not (Test-Path $logDir)) {
    Write-Output "No logs to inspect. Exiting."
    exit 0
}

$failedFiles = Get-ChildItem -Path $logDir -Recurse -File | Where-Object { $_.Length -gt 0 }
if (-not $failedFiles) {
    Write-Output "No non-empty logs found. Exiting."
    exit 0
}

$madeChanges = $false

foreach ($f in $failedFiles) {
    $text = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($text -match "No module named 'apps'" -or $text -match "No module named \"apps\"") {
        Write-Output "Detected missing 'apps' package error in $($f.FullName)"
        $target = Join-Path $RepoRoot "apps\ml_engine\__init__.py"
        $content = @'
import os

# Compatibility package pointing to the hyphenated folder `apps/ml-engine`.
__path__ = [os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'ml-engine'))]
@'
        if (New-FileIfMissing -Path $target -Content $content) {
            Write-Output "Created $target"
            $madeChanges = $true
        } else {
            Write-Output "$target already exists"
        }
    }

    if ($text -match "Postgres did not become reachable after waiting") {
        Write-Output "Detected Postgres readiness failure in $($f.FullName) - adding diagnostic logs is already in CI; please review workflow."
    }
}

if ($madeChanges) {
    Push-Location $RepoRoot
    try {
        git checkout $Branch
        git add -A
        git commit -m "fix(ci): add compatibility package apps.ml_engine to resolve import errors from tests" || Write-Output "Nothing to commit or commit failed"
        git push origin $Branch
        Write-Output "Pushed fixes to $Branch"
    } catch {
        Write-Error "Error committing/pushing fixes: $_"
    } finally {
        Pop-Location
    }
} else {
    Write-Output "No automatic fixes applied."
}
