param(
    [int]$PrNumber = 11,
    [int]$IntervalSeconds = 3600,
    [int]$Limit = 50
)

Write-Output "Starting PR monitor loop for PR #$PrNumber (interval ${IntervalSeconds}s)"
while ($true) {
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/monitor_pr_runs.ps1 -PrNumber $PrNumber -Limit $Limit
        # Run auto-fix runner after fetching logs; it will be a no-op if no fixes apply.
        & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/auto_fix_pr_failures.ps1 -PrNumber $PrNumber
        # Check PR checks summary and merge if all checks passed
        try {
            $checks = gh pr checks $PrNumber --repo FadelSearr/Dellmology-pro 2>$null
            if ($checks -match "0 failing, 0 pending") {
                Write-Output "All checks passed — merging PR #$PrNumber"
                gh pr merge $PrNumber --repo FadelSearr/Dellmology-pro --merge --delete-branch --confirm
                break
            }
        } catch {
            Write-Error "Failed to evaluate PR checks: $_"
        }
    } catch {
        Write-Error "Monitor run failed: $_"
    }
    Start-Sleep -Seconds $IntervalSeconds
}
