# Create or remove the worktree pair for one wave session (PARALLEL-WAVES-PLAN.md, A2).
#
#   powershell -File Execution/_queue/wave_worktree.ps1 -Task T078 -Branch p4-registry-licence
#   powershell -File Execution/_queue/wave_worktree.ps1 -Task T107 -Branch p7-title-ladder -App
#   powershell -File Execution/_queue/wave_worktree.ps1 -Task T107 -Remove -App
#
# Root worktree: sparse (the root tracks ~48,700 files under continent-app/).
# App worktree: full checkout of continent-app master, node_modules joined to the
# main checkout's, and the gitignored generated data in public/ joined (folders)
# or copied (files) from the main checkout so the app runs. Never commit them;
# they are gitignored in the app repo anyway.
# -Base lets a second task in the same session branch from the first one's branch.
param(
  [Parameter(Mandatory)] [string] $Task,
  [string] $Branch,
  [switch] $App,
  [switch] $Remove,
  [string] $Base = ''
)
$ErrorActionPreference = 'Stop'
# git writes progress to stderr; in Windows PowerShell 5.1 that is an error record
# under 'Stop', so run git with 'Continue' and judge it by its exit code.
function G {
  $ErrorActionPreference = 'Continue'
  & git @args 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed ($LASTEXITCODE)" }
}
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$WtRoot = Join-Path (Split-Path -Parent $Repo) 'wt'
$RootWt = Join-Path $WtRoot $Task
$AppWt = Join-Path $WtRoot "$Task-app"
$AppRepo = Join-Path $Repo 'continent-app'

if ($Remove) {
  if ($App -and (Test-Path $AppWt)) {
    # remove junctions first so worktree removal never follows them
    $dirs = @($AppWt, (Join-Path $AppWt 'public')) | Where-Object { Test-Path $_ }
    Get-ChildItem $dirs -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.LinkType -eq 'Junction' } |
      ForEach-Object { $_.Delete() }
    # Never let git remove a tree that still links into the main checkout's data or node_modules:
    # a forced remove could follow a junction. Stop any dev server in the worktree first.
    $left = Get-ChildItem $dirs -Force -ErrorAction SilentlyContinue | Where-Object { $_.LinkType -eq 'Junction' }
    if ($left) { throw "junctions still present in $AppWt; not removing: $($left.Name -join ', ')" }
    G -C $AppRepo worktree remove --force $AppWt
  }
  if (Test-Path $RootWt) { G -C $Repo worktree remove --force $RootWt }
  Write-Output "removed worktrees for $Task (branches kept)"
  exit 0
}

if (-not $Branch) { throw '-Branch is required' }
New-Item -ItemType Directory -Force $WtRoot | Out-Null

$rootBase = if ($Base) { $Base } else { 'main' }
$env:GIT_LFS_SKIP_SMUDGE = '1'
G -C $Repo worktree add --no-checkout $RootWt -b $Branch $rootBase
G -C $RootWt sparse-checkout set --cone Execution pipeline src docs tests Trips tools reports .github infra supabase
G -C $RootWt checkout $Branch
Write-Output "root worktree: $RootWt ($Branch from $rootBase)"

if ($App) {
  $appBase = if ($Base) { $Base } else { 'master' }
  G -C $AppRepo worktree add $AppWt -b $Branch $appBase
  New-Item -ItemType Junction -Path (Join-Path $AppWt 'node_modules') -Target (Join-Path $AppRepo 'node_modules') | Out-Null
  $mainPublic = Join-Path $AppRepo 'public'
  $wtPublic = Join-Path $AppWt 'public'
  foreach ($item in Get-ChildItem $mainPublic -Force) {
    $dest = Join-Path $wtPublic $item.Name
    if (Test-Path $dest) { continue }   # tracked in the app repo: the worktree has its own
    if ($item.PSIsContainer) {
      New-Item -ItemType Junction -Path $dest -Target $item.FullName | Out-Null
    } else {
      Copy-Item $item.FullName $dest
    }
  }
  Write-Output "app worktree:  $AppWt ($Branch from $appBase; node_modules and generated public data joined)"
}
