# Re-enrich the beach rows whose photograph phase never ran.
#
# The listed tier shipped 3,745 map cards reading "we have no freely
# licensed photograph of it yet". Most of those rows were never asked:
# across cache/beaches/rich_*.json there were 18,400 rows with
# `images: null` (the image phase never ran for them) against only 1,544
# with `images: []` (it ran and Commons had nothing). A live sample of 25
# never-asked Italian beaches came back with photographs for 13.
#
# Raising --shortlist is additive, not destructive: enrich_country writes
# the shortlist AS the whole cache, so a larger shortlist is a superset of
# the old one, and the carry-over block copies images, article facts,
# views, region ids and context forward before any phase runs. Verified on
# MT: 29 -> 66 with photographs, 0 rows dropped, article and context
# counts unchanged.
#
# --no-context skips Overpass (it shares a slot budget with the harvest)
# and --no-aspect skips the coastline pass, so this run only spends
# Wikimedia calls, at IMAGE_WORKERS = 2.
#
# Resumable by construction: save_cache is atomic (temp file plus
# os.replace) and runs once per country, and the image phase only shoots
# rows whose `images` is null. So an interrupted run costs at most the
# country in flight, and re-running this script skips every country that
# already finished in seconds.
#
# NEVER launch this from a foreground console you might close: it dies
# with its parent. Launch it detached, which also snapshots it so an edit
# mid-run cannot corrupt the running copy:
#
#   powershell -File pipeline/launch_detached.ps1 pipeline/beaches/run_reenrich.ps1
#
# ASCII clean, no em dashes, per project convention.
param(
    [int]$Shortlist = 3000,
    [string[]]$Countries = @('IT', 'ES', 'FR', 'GR', 'SE', 'GB', 'NO', 'HR',
                             'DE', 'PT', 'FI', 'NL', 'PL', 'DK', 'IE', 'EE',
                             'TR', 'CY', 'MT', 'IS')
)

$ErrorActionPreference = "Continue"
$env:PYTHONIOENCODING = 'utf-8'
# NOT $PSScriptRoot: launch_detached.ps1 runs a SNAPSHOT of this file from
# pipeline\logs\.snapshots\, so a repo root derived from the script's own
# location lands two directories deep and every relative path doubles into
# pipeline\pipeline\... The launcher already sets the working directory to
# the repo root, so trust that and verify it rather than recomputing.
$repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $repo "pipeline\beaches\enrich_beaches.py"))) {
    throw "not at the repo root: $repo"
}

$receipt = Join-Path $repo "pipeline\logs\reenrich_receipt.json"
$state = [ordered]@{
    started_at = (Get-Date).ToUniversalTime().ToString("o")
    shortlist  = $Shortlist
    countries  = @()
    done       = $false
}

foreach ($cc in $Countries) {
    $t0 = Get-Date
    Write-Output "=== $cc start $($t0.ToString('o')) ==="
    # 2>&1 on a native exe in PowerShell 5.1 wraps stderr lines in
    # ErrorRecords, so the python call is left alone and its stderr goes to
    # the launcher's .err.log instead.
    python -u pipeline/beaches/enrich_beaches.py --countries $cc `
        --shortlist $Shortlist --no-context --no-aspect
    $code = $LASTEXITCODE
    $secs = [math]::Round(((Get-Date) - $t0).TotalSeconds, 0)
    Write-Output "=== $cc done exit=$code in ${secs}s ==="

    # A completion receipt per country, written as we go: the log is the
    # narrative, this is the machine-readable answer to "how far did it
    # get before it died".
    $state.countries += [ordered]@{ cc = $cc; exit = $code; seconds = $secs }
    $state | ConvertTo-Json -Depth 5 | Out-File -FilePath $receipt -Encoding utf8
}

$state.done = $true
$state.finished_at = (Get-Date).ToUniversalTime().ToString("o")
$state | ConvertTo-Json -Depth 5 | Out-File -FilePath $receipt -Encoding utf8
Write-Output "ALL_DONE"
