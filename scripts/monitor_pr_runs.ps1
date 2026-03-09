param(
    [int]$PrNumber = 11,
    [int]$Limit = 50
)

try {
    # Determine PR head branch, then list runs for that branch
    $prInfo = gh pr view $PrNumber --json headRefName 2>$null
    if (-not $prInfo) {
        Write-Output "PR #$PrNumber not found or gh CLI failed."
        exit 0
    }
    $headBranch = ($prInfo | ConvertFrom-Json).headRefName
    if (-not $headBranch) {
        Write-Output "Could not determine head branch for PR #$PrNumber."
        exit 0
    }

    $runsJson = gh run list --branch $headBranch --limit $Limit --json databaseId,conclusion,workflowName,headBranch,url 2>$null
    if (-not $runsJson) {
        Write-Output "No runs found for PR #$PrNumber (branch $headBranch)."
        exit 0
    }

    $runs = $runsJson | ConvertFrom-Json
    $failed = $runs | Where-Object { $_.conclusion -ne 'success' -and $_.conclusion -ne $null }
    if (-not $failed) {
        Write-Output "No failed runs for PR #$PrNumber."
        exit 0
    }

    $outDir = Join-Path -Path (Get-Location) -ChildPath "pr-logs"
    New-Item -Path $outDir -ItemType Directory -Force | Out-Null

    foreach ($r in $failed) {
        $id = $r.databaseId
        $wf = $r.workflowName
        $conclusion = $r.conclusion
        Write-Output "Downloading run $id ($wf) with conclusion $conclusion"
        $dest = Join-Path $outDir $id
        gh run download $id -D $dest 2>$null

        # Telemetry: list downloaded files and sizes, warn on zero-length
        if (Test-Path $dest) {
            $files = Get-ChildItem -Path $dest -Recurse -File -ErrorAction SilentlyContinue
            if ($files) {
                Write-Output "Files downloaded for run $id:"
                foreach ($f in $files) {
                    Write-Output "  $($f.FullName) - $($f.Length) bytes"
                    if ($f.Length -eq 0) { Write-Warning "Zero-length file: $($f.FullName)" }
                }
            } else {
                Write-Warning "No files found under $dest after download"
            }
        } else {
            Write-Warning "Download target $dest not created for run $id"
        }
    }

    Write-Output "Download complete. Check the pr-logs/ directory."
} catch {
    Write-Error "Error while listing/downloading runs: $_"
    exit 1
}
