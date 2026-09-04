# The finishing sequence, unattended: everything that has to happen AFTER the
# cycling chain publishes, so a full rebuild needs no session watching it.
#
# Why a separate script rather than more stages in run_all.ps1: that driver is
# already running, and editing a script mid-execution is how a previous run
# re-ran a stage it had just failed. This waits for it instead.
#
# The order is the contract (docs/JOINS.md):
#   trails refresh   the scenic re-link changed the input rate.py reads, so
#                    the published ratings and wire are stale until it runs;
#                    Malta's derived routes ride along
#   joins            stamps nb into every published row. MUST come after every
#                    layer export, because an export rewrites its files
#                    without nb
#   coverage         audits the wire that actually shipped, cycling included
#   export_regions   region pages composed from stamped rows
#   build            new country files reach dist
#   verify           the harnesses that do not need a dev server
#
# Usage: LAUNCH THROUGH pipeline/launch_detached.ps1, not Start-Process
# directly against this file - see that script's header for why (the
# self-re-exec this used to do here died silently under a hidden host on
# this machine, twice, hours lost each time). Running this file straight in
# a foreground console (as below) is still fine and does no snapshotting.
#   powershell -File pipeline/finish_run.ps1                 # wait, then run
#   powershell -File pipeline/finish_run.ps1 -WaitPid 9272
#   powershell -File pipeline/finish_run.ps1 -NoWait         # run now
#   powershell -File pipeline/finish_run.ps1 -SkipTrails
param(
    [int]$WaitPid = 0,
    [switch]$NoWait,
    [switch]$SkipTrails,
    [switch]$SkipBuild,
    [switch]$Force      # publish even if the cycling driver left no receipt
)

$ErrorActionPreference = "Continue"
# Search upward for the repo root rather than assuming a fixed depth off
# $PSScriptRoot: a snapshot in pipeline/logs/.snapshots/ sits one directory
# deeper than this file's home in pipeline/, so `..` alone silently resolved
# to the wrong place there and broke every relative path built from it. Same
# bug, same fix, as pipeline/cycling/run_all.ps1 (see its comment for the
# full account - it cost most of a session before this was found).
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
$Master = Join-Path $L "finish_run.log"
$env:PYTHONIOENCODING = "utf-8"
$StartedAt = Get-Date

function Log([string]$m) {
    # Same bug as run_all.ps1's Log-All (see its comment for the full
    # account): `Write-Output` here leaked onto the caller's return value,
    # because every call site is `$rc = Step ... ` and Step calls Log before
    # its own `return $rc`. That is almost certainly why the joins step once
    # looked like it exited 2 when it had actually stamped every row -
    # $rcJoins was an array with the log lines mixed in, not a real exit
    # code. [Console]::Out bypasses the pipeline so nothing here can leak.
    $line = "$(Get-Date -Format 'HH:mm:ss') $m"
    [Console]::Out.WriteLine($line)
    # Another finisher (an armed one waiting on a driver) may hold the log
    # open. A locked file must never cost us the message, so retry briefly
    # and fall back to a pid-suffixed file rather than throwing it away.
    for ($i = 0; $i -lt 5; $i++) {
        try { Add-Content -Path $Master -Value $line -Encoding utf8 -ErrorAction Stop; return }
        catch { Start-Sleep -Milliseconds 200 }
    }
    try {
        Add-Content -Path ($Master -replace '\.log$', ".$PID.log") `
                    -Value $line -Encoding utf8 -ErrorAction Stop
    } catch { }
}

function Step([string]$name, [string]$cmdline, [switch]$Fatal) {
    Log "=== $name ==="
    cmd /c "$cmdline > `"$L\finish_$name.log`" 2>&1"
    $rc = $LASTEXITCODE
    Log "    $name exit=$rc"
    if ($rc -ne 0 -and $Fatal) {
        Log "STOPPED at $name (fatal). See pipeline/logs/finish_$name.log"
        exit 1
    }
    return $rc
}

# 1. Wait for the cycling driver, if one is still going.
if (-not $NoWait) {
    if ($WaitPid -gt 0) {
        Log "waiting for pid $WaitPid (the cycling driver)"
        while (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 60 }
    } else {
        # No pid given: wait while any cycling python is alive.
        Log "waiting for any pipeline/cycling python to finish"
        while (Get-CimInstance Win32_Process -Filter "name like 'python%'" |
               Where-Object { $_.CommandLine -like "*pipeline/cycling*" }) {
            Start-Sleep -Seconds 60
        }
    }
    Log "cycling driver has exited"

    # A driver that exits is not a driver that finished. On 2026-09-02 one
    # died silently after land cover and this script published the wire it
    # had not rebuilt, reporting success for a run that was two thirds
    # missing. So the receipt run_all.ps1 writes on a clean pass is now the
    # gate, and it has to be NEWER than this wait started, or it belongs to
    # a previous run.
    $receipt = Join-Path $L "cycling_complete.txt"
    $fresh = (Test-Path $receipt) -and
             ((Get-Item $receipt).LastWriteTime -gt $StartedAt)
    if (-not $fresh -and $Force) {
        Log "no fresh completion receipt, but -Force was passed: publishing"
        Log "  the cycling wire AS IT STANDS. Whatever the driver did not"
        Log "  rebuild ships in its previous state."
    }
    if (-not $fresh -and -not $Force) {
        Log "REFUSING to publish: no fresh completion receipt at $receipt."
        Log "  The cycling driver exited without finishing its stages."
        Log "  Inspect pipeline/logs/cycling_all.log, resume with"
        Log "  run_all.ps1 -From <stage>, or re-run this with -Force to"
        Log "  publish the wire as it stands."
        exit 2
    }
    Log "cycling completion receipt is fresh; publishing"
}

# 2. Trails: the refresh the scenic re-link owes, plus Malta's derived routes.
#    Not fatal: a stale trails wire still joins and still ships.
if (-not $SkipTrails) {
    Step "trails" "powershell -NoProfile -ExecutionPolicy Bypass -File pipeline\trails\refresh_after_scenic.ps1"
}

# 3. The cross-layer join.
#
#    Judged by its OUTPUT, not by its exit code. A stray non-zero exit here
#    (a Windows file lock from a concurrent pass, a flush error on teardown)
#    once aborted a finisher whose joins pass had in fact stamped all 11,536
#    rows and written the model. What actually matters is whether joins.json
#    is fresh, so that is what decides, and the exit code is only reported.
$rcJoins = Step "joins" "python -u pipeline/joins/neighbours.py"
$joinsModel = Join-Path $Repo "continent-app\public\joins.json"
$joinsFresh = (Test-Path $joinsModel) -and
              ((Get-Item $joinsModel).LastWriteTime -gt $StartedAt)
if (-not $joinsFresh) {
    Log "STOPPED: joins wrote no fresh public/joins.json (exit $rcJoins)."
    Log "  The neighbour blocks read that wire, and a half-stamped one is"
    Log "  worse than an unstamped one. See pipeline/logs/finish_joins.log"
    exit 1
}
if ($rcJoins -ne 0) {
    Log "  joins exited $rcJoins but wrote a fresh model; continuing"
}

# 4. Coverage audit over what actually shipped, then the region pages.
Step "coverage" "python -u pipeline/regions/coverage.py"
Step "regions"  "python -u pipeline/regions/export_regions.py --all"

# 5. Ship: the wire has to reach dist or the new country files sit in public/.
if (-not $SkipBuild) {
    Step "build" "cd /d `"$Repo\continent-app`" && npm run build"
}

# 6. The harnesses that need no dev server. Reported, never fatal: this script
#    has already written everything, and a red harness is a finding to read
#    rather than a reason to leave the log unwritten.
Step "verify_joins" "cd /d `"$Repo\continent-app`" && node scripts/verify_joins.mjs"

Log "=== finish_run done ==="
