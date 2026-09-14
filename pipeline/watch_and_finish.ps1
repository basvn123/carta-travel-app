# Supervise the in-flight cycling driver, then finish the run.
#
# One-off bridge for the run started 2026-09-03 10:33 from a driver that
# predates the completion receipt (its snapshot and receipt code landed after
# it was launched). Rather than restart it and throw away a services pass
# that is most of an hour in, this watches it, decides for itself whether the
# chain really finished, writes the receipt if so, and hands over to
# finish_run.ps1.
#
# "Really finished" is judged from the wire, not from an exit code: the
# cycling export must have rewritten public/cycling/index.json AFTER this
# script started, and it must name more than the one country GB that was
# published before. That is the check the silent death on 2026-09-02 needed
# and did not have.
#
# Usage: LAUNCH THROUGH pipeline/launch_detached.ps1 if this needs to
# outlive the current session - see that script's header. This file no
# longer snapshots itself; a plain foreground run needs no snapshot anyway.
#   powershell -File pipeline/watch_and_finish.ps1 -WaitPid 29080
param(
    [Parameter(Mandatory = $true)][int]$WaitPid
)

$ErrorActionPreference = "Continue"
# Search upward for the repo root: see pipeline/cycling/run_all.ps1's
# comment on Find-Repo for why a fixed ..\.. off $PSScriptRoot is wrong for
# a snapshot in pipeline/logs/.snapshots/.
function Find-Repo([string]$from) {
    $dir = Get-Item $from
    while ($dir -and -not (Test-Path (Join-Path $dir.FullName "run_pipeline.py"))) {
        $dir = $dir.Parent
    }
    if (-not $dir) { throw "could not find the repo root (run_pipeline.py) above $from" }
    return $dir.FullName
}
$Repo = Find-Repo $PSScriptRoot
Set-Location $Repo
$L = Join-Path $Repo "pipeline\logs"
New-Item -ItemType Directory -Force $L | Out-Null
$Log = Join-Path $L "watch_and_finish.log"
$StartedAt = Get-Date
$Index = Join-Path $Repo "continent-app\public\cycling\index.json"

function Say([string]$m) {
    # [Console]::Out rather than Write-Output: see run_all.ps1's Log-All
    # comment. Not currently captured by any caller here, but a future one
    # that does `$x = Say ...` deserves a real value, not a leaked array.
    $line = "$(Get-Date -Format 'HH:mm:ss') $m"
    [Console]::Out.WriteLine($line)
    Add-Content -Path $Log -Value $line -Encoding utf8
}

Say "watching cycling driver pid $WaitPid"
while (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 60 }
Say "driver exited"

# Did the export actually run, and did it publish more than GB?
$ok = $false
if (Test-Path $Index) {
    $stamp = (Get-Item $Index).LastWriteTime
    try {
        $idx = Get-Content $Index -Raw | ConvertFrom-Json
        $n = @($idx.countries).Count
        Say "cycling/index.json written $stamp, $n country(ies), $($idx.n_routes) routes"
        $ok = ($stamp -gt $StartedAt) -and ($n -gt 1)
    } catch { Say "could not parse cycling/index.json: $_" }
} else {
    Say "no cycling/index.json on disk"
}

if (-not $ok) {
    Say "NOT publishing: the cycling chain did not reach a multi-country export."
    Say "  Resume it with: powershell -File pipeline\cycling\run_all.ps1 -From <stage>"
    Say "  (the stage it stopped in is the last '=== name :' line without an"
    Say "  exit= line in pipeline/logs/cycling_all.log, or the newest"
    Say "  pipeline/logs/cycling_*.log by modification time)"
    exit 2
}

Say "cycling published $n countries; writing the receipt and finishing"
Set-Content -Path (Join-Path $L "cycling_complete.txt") -Encoding utf8 -Value @(
    "completed_at=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "verified_by=watch_and_finish.ps1"
)
& powershell -NoProfile -ExecutionPolicy Bypass `
    -File (Join-Path $Repo "pipeline\finish_run.ps1") -NoWait -SkipTrails
Say "finish_run exited $LASTEXITCODE"
