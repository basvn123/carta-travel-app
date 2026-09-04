# The whole cycling layer, every country, in the one order that works - Windows native.
#
# This replaces run_all.sh as the full-Europe driver on this machine. The bash
# version died six times in a row without getting past landcover, and not on
# the data: Git Bash's fork emulation exhausts (0xC000026B DLL-init failures)
# under long multi-stage runs, and run_all.sh's `return 0` made a stage that
# could not even start look identical to one that succeeded. This driver runs
# the same stages with real exit codes: a failing stage STOPS the run (use
# -KeepGoing to override) and prints the resume command.
#
# THE ORDER IS THE POINT (inherited from run_all.sh, every line learned the
# hard way):
#   splice BEFORE enrich      services on a discontinuous line get no position
#   landcover BEFORE scenic   scenic reads the land-cover table
#   elevation BEFORE sync     splice rescales spans after elevation
#   near BEFORE scenic        the catalogue component reads it
#   rate BEFORE photos        cycle_images targets ORDER BY rating DESC, so a
#                             photo-blind rating pass first points the bounded
#                             photo budget at the best candidates; rate runs
#                             again after photos so tiers see the galleries
#   photos are BOUNDED        a full Commons pass is ~72 h for Europe; the
#                             driver spends PhotoLimit per country on the top
#                             candidates instead, and a re-run never re-asks
#                             about a route Commons had nothing for
#
# One country at a time inside each stage (two concurrent extract passes put
# this Postgres into crash recovery once). Land cover splits small/big because
# area assembly is MEMORY bound: the big extracts run one by one, last.
#
# Usage, from the repo root (DB up: cd tools/trailslab; docker compose up -d):
#   powershell -File pipeline/cycling/run_all.ps1                 # everything
#   powershell -File pipeline/cycling/run_all.ps1 -List
#   powershell -File pipeline/cycling/run_all.ps1 -From enrich_ele
#   powershell -File pipeline/cycling/run_all.ps1 -Only rate,export
#   powershell -File pipeline/cycling/run_all.ps1 -PhotoLimit 0   # skip photos
param(
    [string]$From = "",
    [string]$Only = "",
    [switch]$List,
    [switch]$KeepGoing,
    [int]$PhotoLimit = 40
)

$ErrorActionPreference = "Continue"
# THE ROOT-CAUSE BUG, found 2026-09-03 after most of a session chasing it as
# a re-exec / hidden-window / Write-Host problem: it was none of those.
# `..\..` off $PSScriptRoot assumes this file lives at pipeline/cycling/,
# which is true of the repo copy but NOT of a snapshot in
# pipeline/logs/.snapshots/ - one directory deeper, so $Repo silently
# resolved to pipeline/ instead of the real root, and every relative path
# built from it afterward (Set-Location, `cmd /c python -u pipeline/...`)
# pointed at files that do not exist there. cmd.exe swallows that into a
# bare non-zero exit with no readable message, which is why every stage
# appeared to die instantly with nothing to explain it. Search upward for a
# fixed marker instead of assuming a fixed depth, so this resolves the same
# way from the repo copy, a snapshot, or a snapshot nested one level deeper.
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

# RUN FROM A SNAPSHOT, NEVER FROM THE REPO COPY.
#
# This is not caution, it is scar tissue, twice over.
#
# 2026-09-02: this file was edited at 20:37 while a full-Europe run was
# executing it, and the run died at 23:06 the instant the stage it was in
# returned: PowerShell had re-read the changed file and lost its place in
# the stage loop.
#
# 2026-09-03: the first fix for that had THIS script copy itself and
# re-exec the copy internally (`& powershell @argv` from inside its own
# body). It died instantly and silently under `Start-Process -WindowStyle
# Hidden`, and for most of a session that looked like the nesting was the
# problem. It was not: two REAL, separate bugs were hiding behind "no error
# ever appears" (Start-Process drops the child's stdout/stderr unless you
# redirect them, so neither one was ever visible until that was added to
# pipeline/launch_detached.ps1):
#   1. `Start-Process -ArgumentList` does not quote array elements that
#      contain a space, and this repo lives under "Travel App". An unquoted
#      snapshot path arrived at the child truncated at the space.
#   2. The snapshot's own `$PSScriptRoot` sits at pipeline/logs/.snapshots/,
#      one directory deeper than pipeline/cycling/, so a fixed `..\..`
#      resolved $Repo to the wrong directory and every relative path built
#      from it afterward pointed at files that do not exist there - see
#      Find-Repo below, which is the actual fix.
# Once both were fixed, the self-re-exec pattern worked fine too. It is
# still done from the CALLER now (pipeline/launch_detached.ps1) rather than
# internally, because that is simpler to reason about, not because nesting
# was ever the defect.
$L = Join-Path $Repo "pipeline\logs"
New-Item -ItemType Directory -Force $L | Out-Null
$AllLog = Join-Path $L "cycling_all.log"
$Py = "python"

# The big five plus the two the small pass defers on size; landcover.py skips
# any country that already has polygons, so listing a finished one is free.
$BigLandcover = "NL,NO,PL,IT,ES,DE,FR"

# Photo countries: everything harvested except GB (already photographed).
$PhotoCountries = @(
    "AD","AL","AT","BA","BE","BG","CH","CY","CZ","DE","DK","EE","ES","FI",
    "FO","FR","GR","HR","HU","IE","IS","LI","LT","LU","LV","MD","ME","MK",
    "MT","NL","NO","PL","PT","RO","RS","SE","SI","SK","TR","UA","XK"
)

$Stages = [ordered]@{
    "splice_all"      = @("pipeline/cycling/splice_cycling.py")
    "enrich_fast"     = @("pipeline/cycling/enrich_cycling.py", "--steps", "regions,surface,safety")
    "landcover_small" = @("pipeline/cycling/landcover.py", "--max-gb", "2")
    "landcover_big"   = @("pipeline/cycling/landcover.py", "--countries", $BigLandcover)
    "enrich_services" = @("pipeline/cycling/enrich_cycling.py", "--steps", "services,routeservices")
    "enrich_ele"      = @("pipeline/cycling/enrich_cycling.py", "--steps", "elevation")
    "splice_sync"     = @("pipeline/cycling/splice_cycling.py", "--sync-only")
    "enrich_scenic"   = @("pipeline/cycling/enrich_cycling.py", "--steps", "near,scenic", "--refresh")
    "rate_blind"      = @("pipeline/cycling/cycle_index.py")
    "photos"          = "PHOTOS"   # special-cased below: bounded, per country
    "crosscheck"      = @("pipeline/cycling/harvest_cycling.py", "--crosscheck")
    "rate"            = @("pipeline/cycling/cycle_index.py")
    "tours"           = @("pipeline/cycling/stage_planner.py")
    "validate"        = @("pipeline/cycling/validate_cycling.py", "--verbose")
    "export"          = @("pipeline/cycling/export_cycling.py")
}

# Stages whose failure must NOT strand the publish. crosscheck is a trust
# signal (how much of a national portal's alignment our routes agree with),
# not a precondition for shipping a route: on 2026-09-03 one portal's 3D
# geometry failed its insert and took down a run that had already scored
# 32,264 routes, leaving the whole layer unpublished over a badge. photos is
# the same shape, and already keeps going per country internally.
$Advisory = @("crosscheck", "photos")

if ($List) { $Stages.Keys | ForEach-Object { $_ }; exit 0 }

function Log-All([string]$msg) {
    # THE BUG THAT MADE A SUCCESSFUL RUN LOOK FAILED, found 2026-09-03:
    # `Write-Output` here put the log line onto the FUNCTION'S OWN output
    # stream, and PowerShell functions return everything they do not
    # explicitly suppress. Every call site is `$rc = Run-Stage ...`, and
    # Run-Stage calls Log-All twice before its `return $rc` - so $rc was
    # never the exit code, it was an ARRAY of [logline, logline, ..., $rc].
    # `if ($rc -ne 0)` on that array is true almost always (a non-empty
    # collection is truthy), so a stage that exited 0 still hit the STOPPED
    # branch. `[Console]::Out.WriteLine` bypasses the pipeline entirely, so
    # nothing here can leak into a caller's return value again.
    $line = "$msg"
    [Console]::Out.WriteLine($line)
    # A concurrent diagnostic run (a manual -From test, another finisher)
    # can hold this file open; a lock must cost a retry, never the message.
    for ($i = 0; $i -lt 5; $i++) {
        try { Add-Content -Path $AllLog -Value $line -Encoding utf8 -ErrorAction Stop; return }
        catch { Start-Sleep -Milliseconds 200 }
    }
}

function Run-Stage([string]$name, $argv) {
    $stamp = Get-Date -Format HH:mm:ss
    Log-All "=== $name : $stamp ==="
    $log = Join-Path $L "cycling_$name.log"
    $env:PYTHONIOENCODING = "utf-8"
    # cmd-level redirection: PowerShell's *> writes UTF-16 in 5.1 and wraps
    # stderr lines in ErrorRecords; cmd hands the bytes through untouched.
    cmd /c "`"$Py`" -u $($argv -join ' ') > `"$log`" 2>&1"
    $rc = $LASTEXITCODE
    $stamp = Get-Date -Format HH:mm:ss
    Log-All "    $name exit=$rc $stamp"
    return $rc
}

function Run-Photos {
    # Bounded per-country pass, best candidates first (needs rate_blind).
    if ($PhotoLimit -le 0) { Log-All "=== photos : skipped (PhotoLimit 0) ==="; return 0 }
    $log = Join-Path $L "cycling_photos.log"
    $env:PYTHONIOENCODING = "utf-8"
    $worst = 0
    foreach ($cc in $PhotoCountries) {
        $stamp = Get-Date -Format HH:mm:ss
        Log-All "=== photos [$cc] limit $PhotoLimit : $stamp ==="
        cmd /c "`"$Py`" -u pipeline/cycling/cycle_images.py --countries $cc --limit $PhotoLimit >> `"$log`" 2>&1"
        $rc = $LASTEXITCODE
        Log-All "    photos [$cc] exit=$rc"
        if ($rc -ne 0) { $worst = $rc }   # keep going: one country's Commons trouble
    }                                     # should not strand the other forty
    return $worst
}

$names = @($Stages.Keys)
if ($Only) {
    $pick = $Only.Split(",") | ForEach-Object { $_.Trim() }
    $names = $names | Where-Object { $pick -contains $_ }
} elseif ($From) {
    $i = $names.IndexOf($From)
    if ($i -lt 0) { Write-Output "unknown stage '$From' (see -List)"; exit 2 }
    $names = $names[$i..($names.Count - 1)]
}

Log-All ("=== run_all.ps1 start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') " +
         "stages: $($names -join ' ') ===")
$failed = @()
foreach ($name in $names) {
    if ($Stages[$name] -eq "PHOTOS") { $rc = Run-Photos }
    else { $rc = Run-Stage $name $Stages[$name] }
    if ($rc -ne 0) {
        $failed += $name
        if ($Advisory -contains $name) {
            Log-All "    $name is advisory: failed (exit $rc), continuing to the publish"
            continue
        }
        if (-not $KeepGoing) {
            Log-All "=== STOPPED at '$name' (exit $rc). Inspect pipeline/logs/cycling_$name.log,"
            Log-All "    then resume with: powershell -File pipeline/cycling/run_all.ps1 -From $name ==="
            exit 1
        }
    }
}
# An advisory failure is reported but does not deny the receipt: the routes
# and tours are real and gated, the missing piece is a trust badge.
$blocking = @($failed | Where-Object { $Advisory -notcontains $_ })
if ($blocking.Count) { Log-All "=== done WITH FAILURES: $($blocking -join ', ') ===" ; exit 1 }
if ($failed.Count) { Log-All "=== advisory stage(s) failed: $($failed -join ', ') ===" }
Log-All "=== done $(Get-Date -Format HH:mm:ss) ==="
# The completion receipt the finisher reads. Written ONLY here, at the end of
# a clean pass, because a driver that dies mid-chain must not look finished:
# that is exactly what let a half-built cycling wire reach a publish.
Set-Content -Path (Join-Path $L "cycling_complete.txt") -Encoding utf8 -Value @(
    "completed_at=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "stages=$($names -join ',')"
)
exit 0
