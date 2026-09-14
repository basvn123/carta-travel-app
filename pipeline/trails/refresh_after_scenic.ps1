# Trails refresh after a scenic re-link, plus the Malta derived-route pass.
#
# Why this exists: scenic.py --link-only re-joined 972k scenic features to
# 17,455 routes on 2026-09-02, which changes the scenic density rate.py
# reads, so the published ratings and the wire are stale until
# attributes -> rate -> export run again. Malta rides along because it was
# the one thin country derive_routes.py never ran for (0 derived routes, 35
# published against a floor of 40) - the cheapest coverage fix in the layer.
#
# One heavy DB pass at a time on this machine (two concurrent extract passes
# put the lab into crash recovery once): run this only when nothing else is
# reading the Geofabrik extracts, i.e. after the cycling driver has passed
# its landcover and services stages.
#
# Usage, from the repo root (lab up on 5433):
#   powershell -File pipeline/trails/refresh_after_scenic.ps1
param([switch]$SkipMalta)

$ErrorActionPreference = "Continue"
# Search upward for the repo root rather than assuming a fixed depth: see
# pipeline/cycling/run_all.ps1's Find-Repo comment for why a fixed ..\..
# breaks if this is ever run from a snapshot.
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
$env:PYTHONIOENCODING = "utf-8"

# The 43-country wire list, verbatim from run_pipeline.py's trails_rate task.
$CC = "AL,AD,AT,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GB,GR,HU,IS,IE,IT," +
      "XK,LV,LI,LT,LU,MK,MT,MD,MC,ME,NL,NO,PL,PT,RO,RS,SK,SI,ES,SE," +
      "CH,SM,FO"

function Step([string]$name, [string]$cmdline) {
    # [Console]::Out rather than Write-Output: see run_all.ps1's Log-All
    # comment on why leaking onto the pipeline turns a real exit code into
    # an array in any caller that does `$rc = Step ...`. Not called that way
    # today, but a call site added later deserves a real value.
    $stamp = Get-Date -Format HH:mm:ss
    [Console]::Out.WriteLine("=== $name : $stamp ===")
    Add-Content (Join-Path $L "trails_refresh.log") "=== $name : $stamp ===" -Encoding utf8
    cmd /c "$cmdline > `"$L\trails_$name.log`" 2>&1"
    $rc = $LASTEXITCODE
    Add-Content (Join-Path $L "trails_refresh.log") "    $name exit=$rc" -Encoding utf8
    [Console]::Out.WriteLine("    $name exit=$rc")
    if ($rc -ne 0) {
        [Console]::Out.WriteLine("STOPPED at $name; see pipeline/logs/trails_$name.log")
        exit 1
    }
}

if (-not $SkipMalta) {
    # Malta: stage derived routes, give them elevation, score them, let the
    # curation gate decide. Tiny country, minutes end to end.
    Step "derive_mt"   "python -u pipeline/trails/derive_routes.py --countries MT --verbose"
    Step "elevation_mt" "python -u pipeline/trails/elevation.py --countries MT"
    Step "validate_mt" "python -u pipeline/trails/validate.py --countries MT"
    Step "curate_mt"   "python -u pipeline/trails/curate.py --countries MT"
    Step "scenic_mt"   "python -u pipeline/trails/scenic.py --countries MT"
    Step "attributes_mt" "python -u pipeline/trails/attributes.py --countries MT"
}

# The layer-wide refresh the scenic re-link owes.
Step "attributes" "python -u pipeline/trails/attributes.py"
Step "rate"       "python -u pipeline/trails/rate.py"
Step "export"     "python -u pipeline/trails/export_wire.py --countries $CC"

Write-Output "=== trails refresh done $(Get-Date -Format HH:mm:ss) ==="
