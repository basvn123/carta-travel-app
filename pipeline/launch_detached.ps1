# Launch a driver script detached, from a snapshot, in one non-nested hop.
#
# Why this exists: pipeline/cycling/run_all.ps1, finish_run.ps1 and
# watch_and_finish.ps1 each used to snapshot THEMSELVES and re-exec the copy
# from inside their own body (`& powershell @argv`). Launched via
# `Start-Process -WindowStyle Hidden` - the only way a run outlives the
# session that started it - that self-re-exec died INSTANTLY and SILENTLY
# every time on this machine: no error, no log line, no event-log record.
# It worked perfectly every time run directly in a foreground console. Two
# multi-hour losses on 2026-09-02 and 2026-09-03 came from this before it
# was isolated by direct comparison (foreground -NoSnapshot always worked;
# the hidden nested re-exec never did).
#
# The fix is to do the snapshot-and-launch ONCE, from OUTSIDE, in a plain
# script that itself does no nesting: this file. `Start-Process` here
# targets the snapshot path directly, so the detached process's entire life
# is one hop, one hidden host, no self-relaunch.
#
# Usage: pass the driver's own arguments as trailing, unnamed args to THIS
# script - do not use `-Args @(...)`. `powershell -File x.ps1 -Foo @(...)`
# hands an array through as separate positional tokens rather than binding
# it to `-Foo`, which is a real PowerShell CLI quirk (confirmed 2026-09-03:
# it fails identically whether invoked bare or through `&`), so this reads
# them from $args instead, which the engine always fills correctly.
#
#   powershell -File pipeline/launch_detached.ps1 pipeline/cycling/run_all.ps1 -From crosscheck
#   powershell -File pipeline/launch_detached.ps1 pipeline/finish_run.ps1 -WaitPid 1234 -SkipTrails
#
# Prints the launched process id on its own line (parse the last line of
# stdout), so a caller can pass it straight to another launch_detached.ps1
# invocation (e.g. ... watch_and_finish.ps1 -WaitPid <that pid>).
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Script,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$DriverArgs = @()
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$src = Join-Path $Repo $Script
if (-not (Test-Path $src)) { $src = $Script }  # allow an absolute path too
if (-not (Test-Path $src)) { throw "script not found: $Script" }

$snapDir = Join-Path $Repo "pipeline\logs\.snapshots"
New-Item -ItemType Directory -Force $snapDir | Out-Null
$stem = [IO.Path]::GetFileNameWithoutExtension($src)
$snap = Join-Path $snapDir ("{0}.{1}.ps1" -f $stem, (Get-Date -Format "yyyyMMdd_HHmmss"))
Copy-Item $src $snap -Force

# THE ACTUAL BUG, found 2026-09-03 after most of a day chasing it as a
# re-exec/nesting/Write-Host problem: it was none of those. This repo lives
# under "Travel App" - a path WITH A SPACE - and Start-Process -ArgumentList
# does not quote array elements that contain one. `-File $snap` where $snap
# is "C:\...\Travel App\...\run_all.20260903.ps1" arrives at the child
# process as `-File C:\...\Travel` (truncated at the space) followed by a
# stray `App\...run_all.ps1` token, which PowerShell rejects immediately
# with "does not have a '.ps1' extension" - a message this script had never
# been able to SEE before, because nothing was capturing the child's own
# stdout/stderr; Start-Process silently drops them by default. That is why
# every earlier attempt looked like an instant, silent, unexplainable death.
# Every path built from $Repo needs an explicit quote when it crosses this
# boundary; nothing else in this file's history was ever the problem.
$argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$snap`"") + $DriverArgs
$stdout = Join-Path $snapDir ("{0}.out.log" -f $stem)
$stderr = Join-Path $snapDir ("{0}.err.log" -f $stem)
$p = Start-Process powershell -ArgumentList $argv -WorkingDirectory $Repo `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Write-Output "snapshot: $snap"
Write-Output $p.Id
