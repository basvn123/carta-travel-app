# The merge gate for one wave session (T320, closes T267-e).
#
# Ports the gate of run_queue.ps1 (a committed report, and no app-repo changes
# left behind) to the wave runners. The orchestrator runs it per session before
# merge_branch.sh, step 4 of "How the orchestrator runs a wave":
#
#   powershell -File Execution/_queue/wave_gate.ps1 -Task T320 -Branch p1-ci-queue-hygiene
#   powershell -File Execution/_queue/wave_gate.ps1 -Task T107 -Branch p7-title-ladder -App
#
# It reads the worktrees wave_worktree.ps1 made: <wt>\<Task> (root) and
# <wt>\<Task>-app (app). Exit 0 = every check passed, 1 = hold the session
# (each failure is printed as a line starting with FAIL), 2 = bad input.
# It only reads: it never commits, merges, switches branches or deletes.
#
# Checks:
#  1. The root branch has a report Execution/P*/<Task>-*.md in a commit
#     between <RootBase> and the branch tip (read from git, not the working
#     tree, the lesson of run_queue.ps1's Committed()).
#  2. The root worktree has no modified or staged tracked files (a task that
#     committed its report and left real work uncommitted).
#  3. If the report names continent-app/ (or -App is given), the app worktree
#     exists, its branch has at least one commit past <AppBase>, and it has no
#     modified, staged or untracked files that are not gitignored (the nested
#     repo trap, T062-b). Unlike the queue runner there is no start-of-task
#     snapshot: a wave app worktree is created fresh and used by one session
#     only, so any change in it was left by that session.
#  4. The report is not edited after its commit is closed: the branch carries
#     exactly one commit that adds the report (CLAUDE.md, a closed report is
#     never updated).
#  5. Execution/_OPEN.md in the branch changed (rows for open items, or the
#     status of a row the task closed). Reported as WARN, not FAIL, because a
#     task that raises and resolves nothing writes nothing.
param(
  [Parameter(Mandatory)] [string] $Task,
  [Parameter(Mandatory)] [string] $Branch,
  [switch] $App,
  [string] $RootBase = 'main',
  [string] $AppBase = 'master',
  [string] $WtRoot = ''
)
$ErrorActionPreference = 'Continue'
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $WtRoot) { $WtRoot = Join-Path (Split-Path -Parent $Repo) 'wt' }
$RootWt = Join-Path $WtRoot $Task
$AppWt = Join-Path $WtRoot "$Task-app"
$fails = New-Object System.Collections.Generic.List[string]
function Fail([string]$m) { $script:fails.Add($m); Write-Output "FAIL $m" }
function Pass([string]$m) { Write-Output "ok   $m" }
function GitOut([string]$dir, [string[]]$a) { $o = & git -C $dir @a 2>$null; if ($LASTEXITCODE -ne 0) { return $null }; return ,@($o | Where-Object { $_ }) }

if (-not (Test-Path $RootWt)) { Write-Output "FAIL root worktree $RootWt not found"; exit 2 }

# 1. committed report
$files = GitOut $RootWt @('diff', '--name-only', "$RootBase...$Branch")
if ($null -eq $files) { Write-Output "FAIL cannot diff $RootBase...$Branch in $RootWt"; exit 2 }
$reports = @($files | Where-Object { $_ -match "^Execution/P\d+/$Task-[^/]+\.md$" })
if ($reports.Count -eq 0) { Fail "no report Execution/P*/$Task-*.md committed on $Branch" }
elseif ($reports.Count -gt 1) { Fail "more than one report for ${Task}: $($reports -join ', ')" }
else { Pass "report committed: $($reports[0])" }

# 2. root worktree clean of tracked changes
$dirty = GitOut $RootWt @('status', '--porcelain', '--untracked-files=no')
if ($dirty -and $dirty.Count -gt 0) { Fail "root worktree has $($dirty.Count) uncommitted tracked change(s): $((($dirty | Select-Object -First 5) -join '; '))" }
else { Pass 'root worktree has no uncommitted tracked changes' }

# 3. nested app repo
$needApp = [bool]$App
if ($reports.Count -eq 1) {
  $text = (GitOut $RootWt @('show', "${Branch}:$($reports[0])")) -join "`n"
  if ($text -match 'continent-app/') { $needApp = $true }
}
if ($needApp) {
  if (-not (Test-Path $AppWt)) { Fail "report names continent-app/ but the app worktree $AppWt does not exist" }
  else {
    $n = GitOut $AppWt @('rev-list', '--count', "$AppBase..HEAD")
    if ($null -eq $n -or [int]$n[0] -lt 1) { Fail "app worktree has no commit past $AppBase (the report names continent-app/ files)" }
    else { Pass "app branch has $($n[0]) commit(s) past $AppBase" }
    $adirty = GitOut $AppWt @('status', '--porcelain')
    if ($adirty -and $adirty.Count -gt 0) { Fail "app worktree holds $($adirty.Count) change(s) the task left behind: $((($adirty | Select-Object -First 5) -join '; '))" }
    else { Pass 'app worktree is clean' }
  }
} else { Pass 'report does not name continent-app/, app check skipped' }

# 4. one commit adds the report
if ($reports.Count -eq 1) {
  $adds = GitOut $RootWt @('log', '--format=%h', "$RootBase..$Branch", '--', $reports[0])
  if ($adds -and $adds.Count -gt 1) { Fail "report $($reports[0]) touched by $($adds.Count) commits ($($adds -join ', ')); a closed report is never updated" }
  else { Pass 'report added in a single commit' }
}

# 5. register
$reg = @($files | Where-Object { $_ -eq 'Execution/_OPEN.md' })
if ($reg.Count -eq 0) { Write-Output 'WARN Execution/_OPEN.md not changed on the branch (fine only if the task raised and closed nothing)' }
else { Pass 'Execution/_OPEN.md changed' }

if ($fails.Count -gt 0) { Write-Output "HOLD $Task ($($fails.Count) failure(s))"; exit 1 }
Write-Output "PASS $Task"; exit 0
