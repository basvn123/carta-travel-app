# The countries the first re-enrich queue left out.
#
# run_reenrich.ps1 took the twenty with the biggest gaps. The layer covers
# 43, and the other 21 still held 1,765 rows whose photograph phase had
# never run (`images: null`). Small individually, about an hour together,
# and they are the difference between "the big coasts" and "Europe".
#
# No --shortlist here: these countries harvested fewer beaches than the
# default shortlist already allows, so the quota-derived size is right and
# forcing 3,000 would only pad the cache with rows the score gate will
# refuse anyway.
#
# Same rules as the first queue: --no-context to stay off Overpass,
# --no-aspect to skip the coastline pass, resumable because only a null
# `images` triggers a fetch, and it must be launched detached:
#
#   powershell -File pipeline/launch_detached.ps1 pipeline/beaches/run_reenrich_rest.ps1
#
# ASCII clean, no em dashes, per project convention.
param(
    [string[]]$Countries = @('AT', 'BE', 'CH', 'CZ', 'SK', 'HU', 'RO', 'SI',
                             'LV', 'LT', 'FO', 'BA', 'AL', 'ME', 'BG', 'RS',
                             'LU', 'MK', 'MD', 'AD', 'MC')
)

$ErrorActionPreference = "Continue"
$env:PYTHONIOENCODING = 'utf-8'
# Not $PSScriptRoot: launch_detached runs a snapshot from
# pipeline\logs\.snapshots\, so a root derived from the script's own path
# lands two levels deep and every relative path doubles.
$repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $repo "pipeline\beaches\enrich_beaches.py"))) {
    throw "not at the repo root: $repo"
}

$receipt = Join-Path $repo "pipeline\logs\reenrich_rest_receipt.json"
$state = [ordered]@{
    started_at = (Get-Date).ToUniversalTime().ToString("o")
    countries  = @()
    done       = $false
}

foreach ($cc in $Countries) {
    $t0 = Get-Date
    Write-Output "=== $cc start $($t0.ToString('o')) ==="
    python -u pipeline/beaches/enrich_beaches.py --countries $cc `
        --no-context --no-aspect
    $code = $LASTEXITCODE
    $secs = [math]::Round(((Get-Date) - $t0).TotalSeconds, 0)
    Write-Output "=== $cc done exit=$code in ${secs}s ==="
    # Out-File -Encoding utf8 writes a BOM on PowerShell 5.1: read this
    # with encoding="utf-8-sig", not "utf-8".
    $state.countries += [ordered]@{ cc = $cc; exit = $code; seconds = $secs }
    $state | ConvertTo-Json -Depth 5 | Out-File -FilePath $receipt -Encoding utf8
}

$state.done = $true
$state.finished_at = (Get-Date).ToUniversalTime().ToString("o")
$state | ConvertTo-Json -Depth 5 | Out-File -FilePath $receipt -Encoding utf8
Write-Output "ALL_DONE"
