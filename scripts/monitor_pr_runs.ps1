param(
    [int]$PrNumber = 11,
    [int]$Limit = 50
)

try {
    $runsJson = gh run list --pr $PrNumber --limit $Limit --json databaseId,conclusion,workflowName,headBranch,url 2>$null
    if (-not $runsJson) {
        Write-Output "No runs found for PR #$PrNumber."
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
        gh run download $id -D (Join-Path $outDir $id) 2>$null
    }

    Write-Output "Download complete. Check the pr-logs/ directory."
} catch {
    Write-Error "Error while listing/downloading runs: $_"
    exit 1
}
