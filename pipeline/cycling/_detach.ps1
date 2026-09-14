# Launch the cycling passes DETACHED from whatever started them.
#
# Both long passes have now died twice because they were children of a Claude
# Code session's shell: when the session ends, the process tree goes with it,
# and the second time that cost eight hours of wall clock with nothing running.
# Start-Process gives them their own tree, so they outlive the session that
# asked for them.
#
# Resumable by design, so a second launch is safe: the land-cover stage skips
# countries that already have polygons, and the queue re-checks before each.
param([string]$Repo = "c:\Users\Gebruiker\Documents\Portfolio\Travel App")

$bash = "C:\Program Files\Git\usr\bin\bash.exe"
$logs = Join-Path $Repo "pipeline\logs"

function Start-Detached($script, $log) {
  # -replace takes a REGEX, and a lone backslash is not one. The scripts
  # cd to the repo root themselves, so pass a POSIX path built with
  # Replace() rather than a regex operator.
  $posix = $Repo.Replace('', '/')
  $args = "-lc `"cd '$posix' && bash $script`""
  $p = Start-Process -FilePath $bash -ArgumentList $args `
       -RedirectStandardOutput (Join-Path $logs $log) `
       -RedirectStandardError  (Join-Path $logs ($log -replace '\.log$', '.err.log')) `
       -WindowStyle Hidden -PassThru
  Write-Output "started $script as PID $($p.Id)"
}

Start-Detached "pipeline/cycling/run_all.sh"          "cycling_runall_detached.log"
Start-Sleep -Seconds 8
Start-Detached "pipeline/cycling/_landcover_big.sh"   "cycling_lcbig_detached.log"
