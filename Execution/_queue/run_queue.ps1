# Execution queue: runs T056..T061 one after another in headless Claude Code,
# each with the model the plan assigns, starting automatically once T055's
# report is written and committed. Holds (does not fail) on a usage or rate
# limit and retries once the limit resets.
#
# Launch it detached so it outlives the session that starts it:
#
#   powershell -File pipeline/launch_detached.ps1 Execution/_queue/run_queue.ps1
#
# launch_detached.ps1 copies this file to pipeline/logs/.snapshots/ and runs
# the copy, so editing this file mid-run is harmless. Because it runs a copy,
# $PSScriptRoot is wrong here; the repo root is the launcher's working
# directory, asserted below.
#
# How a task is judged done: its report file exists in Execution/P3/ and is
# committed on some branch. The claude exit code is not trusted on its own.
#
# How the queue orders itself: a task whose prompt file is missing makes the
# queue wait (polling) rather than skip, because the tasks are sequential and
# T056 must not be jumped. Drop the prompt in Execution/_queue/T056.prompt.md
# and the queue picks it up on the next poll.
#
# Logs: Execution/_queue/queue.log (driver), Execution/_queue/logs/T0xx.*.json
# and .err.log (one pair per claude attempt).

param(
    [string]$Claude = "",
    [string]$PermissionMode = "bypassPermissions",
    [switch]$SkipGate,          # start immediately, do not wait for T055
    [int]$LimitWaitMinutes = 30, # fallback hold when the reset time is not parseable
    [int]$MaxLimitHours = 72,    # give up holding on a limit after this long
    [int]$MaxResumes = 2         # continuation attempts per task before FAILED
)

$ErrorActionPreference = "Continue"
$Repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $Repo "run_pipeline.py"))) {
    throw "run_queue.ps1 must run with the repo root as working directory (run_pipeline.py not found under $Repo)"
}

$QueueDir = Join-Path $Repo "Execution\_queue"
$LogDir   = Join-Path $QueueDir "logs"
$LogFile  = Join-Path $QueueDir "queue.log"
New-Item -ItemType Directory -Force $LogDir | Out-Null

function Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    [Console]::Out.WriteLine($line)
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

# Single instance. On 2026-09-28 the queue was launched three times within
# six minutes; two drivers then ran every task twice on the same working
# tree, each agent editing under the other. Refuse to start if another copy
# is alive (the snapshot name differs per launch, so match on the stem).
$others = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -match "run_queue\.\d{8}_\d{6}\.ps1|run_queue\.ps1"
}
if ($others) {
    Log ("refusing to start: run_queue already running as pid " + (($others | ForEach-Object { $_.ProcessId }) -join ", "))
    exit 2
}

# Keep the machine awake while the queue runs. Modern standby suspended a
# detached run for twelve hours on 2026-09-13; this asks Windows not to.
try {
    Add-Type -Name Power -Namespace Carta -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
    # Literal 0x80000001 is a negative Int32 in PowerShell and fails the UInt32 bind; cast first.
    [Carta.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    Log "power: system-required flag set for the life of this process"
} catch { Log "power: could not set execution state ($($_.Exception.Message)); consider powercfg -change -standby-timeout-ac 0" }

# Locate the CLI. The VS Code extension ships a native binary; a global
# install would be on PATH.
if (-not $Claude) {
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    if ($cmd) { $Claude = $cmd.Source }
}
if (-not $Claude) {
    $ext = Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory -Filter "anthropic.claude-code-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($ext) { $Claude = Join-Path $ext.FullName "resources\native-binary\claude.exe" }
}
if (-not $Claude -or -not (Test-Path $Claude)) { throw "claude CLI not found; pass -Claude <path to claude.exe>" }
Log "claude: $Claude"

# The queue. Model ids are the current full names; the plan's "Opus 5" is the
# latest Opus, "Sonnet 5" the latest Sonnet.
$Tasks = @(
    @{ Id="T056"; Slug="remove-fare-runtime-reads";        Model="claude-opus-5-5" },
    @{ Id="T057"; Slug="remove-obsolete-fare-metadata";    Model="claude-haiku-4-5-20251001" },
    @{ Id="T058"; Slug="flight-cost-input-decision";       Model="claude-fable-5-1" },
    @{ Id="T059"; Slug="shard-by-region-viewport";         Model="claude-opus-5-5" },
    @{ Id="T060"; Slug="reduce-poi-payload";               Model="claude-sonnet-5" },
    @{ Id="T061"; Slug="mobile-paint-and-tiles";           Model="claude-sonnet-5" }
)
$GateReport = "Execution/P3/T055-post-migration-measurement.md"

$SystemNote = "You are running unattended from Execution/_queue/run_queue.ps1. Nobody can answer a question or approve anything, so never stop to ask; make the conservative call, record it under What is still open, and finish. The task is only counted as done when its report file exists in Execution/P3 and is committed together with the Execution/_OPEN.md rows, so always reach that step. Do not merge the branch. Do not touch files outside the task's scope. Other sessions may leave modified or untracked files in the working tree: never use git add -A, git add ., or git commit -a; stage only the files this task changed, by name, and leave the rest alone."

# Done means "the report exists in a commit on some branch", read from git, not
# from the working tree: on 2026-09-28 T061 finished in a separate worktree
# after another session switched the main tree's branch, and a Test-Path in
# the main tree said "not done" about a committed report, which would have
# re-run the finished task.
function Committed([string]$relPath) {
    $h = git -C $Repo log --all -1 --format=%H -- $relPath 2>$null
    if (-not $h) { return $false }
    git -C $Repo cat-file -e "${h}:${relPath}" 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Wait-ForGate {
    if ($SkipGate) { Log "gate: skipped by flag"; return }
    Log "gate: waiting for $GateReport to exist and be committed"
    while ($true) {
        if ((Test-Path (Join-Path $Repo $GateReport)) -and (Committed $GateReport)) {
            $ct = [int](git -C $Repo log --all -1 --format=%ct -- $GateReport)
            $age = [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - $ct)
            if ($age -ge 600) { Log "gate: T055 report committed $age s ago, starting"; return }
            Log "gate: T055 committed $age s ago, waiting for a 10 minute quiet period"
        }
        Start-Sleep -Seconds 300
    }
}

# Returns @{ Kind = "ok" | "limit" | "error"; SessionId; ResetAt; Text }
function Invoke-Claude([string]$taskId, [string]$model, [string]$promptFile, [string]$resumeId, [string]$stamp) {
    $outJson = Join-Path $LogDir ("{0}.{1}.json" -f $taskId, $stamp)
    $errLog  = Join-Path $LogDir ("{0}.{1}.err.log" -f $taskId, $stamp)
    $sysFile = Join-Path $LogDir "system_note.txt"
    Set-Content -Path $sysFile -Value $SystemNote -Encoding UTF8

    $flags = "-p --model `"$model`" --output-format json --permission-mode $PermissionMode --append-system-prompt-file `"$sysFile`""
    if ($resumeId) { $flags += " --resume `"$resumeId`"" }
    # cmd /c so the redirects write UTF-8 bytes, not PowerShell 5.1's UTF-16.
    # Start-Process -Wait, not `& cmd`, because `&` waits for the child's
    # stdout pipe to close, and on 2026-09-28 a `vite preview` the T060 agent
    # left running inherited that pipe and held the driver for hours after
    # claude had exited. -Wait waits on the process handle only.
    $cmdline = "/c type `"$promptFile`" | `"$Claude`" $flags > `"$outJson`" 2> `"$errLog`""
    Log "$taskId run: model=$model resume=$(if($resumeId){$resumeId}else{'-'}) log=$outJson"
    # Servers the agent leaves running (dev, preview) must die before the next
    # task, but a bare command-line match would also kill a preview the owner
    # started by hand in another terminal. So only this agent's own descendants
    # are eligible: snapshot the tree while the child is alive (once -Wait
    # returns, its children are reparented and the walk finds nothing), then
    # intersect that set with the server pattern after it exits.
    $proc = Start-Process cmd -ArgumentList $cmdline -WorkingDirectory $Repo -WindowStyle Hidden -PassThru
    $ours = @{}
    if ($proc) { $ours[[int]$proc.Id] = $true }
    while (-not $proc.HasExited) {
        $snap = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
        # Walk down repeatedly: a grandchild can appear before its parent is seen.
        for ($pass = 0; $pass -lt 6; $pass++) {
            foreach ($row in $snap) {
                if ($ours[[int]$row.ParentProcessId] -and -not $ours[[int]$row.ProcessId]) {
                    $ours[[int]$row.ProcessId] = $true
                }
            }
        }
        Start-Sleep -Seconds 5
    }
    $rc = $proc.ExitCode
    $live = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
    $orphans = $live | Where-Object {
        $ours[[int]$_.ProcessId] -and $_.CommandLine -match "vite (preview|dev)|npm run (dev|preview)"
    }
    foreach ($o in $orphans) { Log "$taskId cleanup: killing leftover $($o.Name) pid $($o.ProcessId)"; Stop-Process -Id $o.ProcessId -Force -ErrorAction SilentlyContinue }

    $text = ""; $sid = ""; $isErr = $false
    if (Test-Path $outJson) {
        $raw = Get-Content -Raw $outJson -ErrorAction SilentlyContinue
        try {
            $j = $raw | ConvertFrom-Json
            if ($j.result) { $text = [string]$j.result }
            if ($j.session_id) { $sid = [string]$j.session_id }
            if ($j.is_error) { $isErr = $true }
        } catch { $text = [string]$raw }
    }
    $err = if (Test-Path $errLog) { Get-Content -Raw $errLog -ErrorAction SilentlyContinue } else { "" }
    $all = "$text`n$err"

    $limitRx = "usage limit|hit your limit|rate limit|limit reached|limit will reset|resets at|resets \d|overloaded|out of extra usage|too many requests|429|529"
    if ($all -match $limitRx) {
        $reset = $null
        if ($all -match "limit reached\|(\d{9,11})") { $reset = [DateTimeOffset]::FromUnixTimeSeconds([long]$Matches[1]).LocalDateTime }
        return @{ Kind="limit"; SessionId=$sid; ResetAt=$reset; Text=($all.Substring(0, [Math]::Min(300, $all.Length))) }
    }
    if ($rc -ne 0 -or $isErr) {
        return @{ Kind="error"; SessionId=$sid; Text=("rc=$rc " + $all.Substring(0, [Math]::Min(300, $all.Length))) }
    }
    return @{ Kind="ok"; SessionId=$sid; Text="" }
}

function Run-Task($t) {
    $report = "Execution/P3/{0}-{1}.md" -f $t.Id, $t.Slug
    $promptFile = Join-Path $QueueDir ("{0}.prompt.md" -f $t.Id)
    $fullReport = Join-Path $Repo $report

    if (Committed $report) { Log "$($t.Id): report already committed, skipping"; return $true }

    while (-not (Test-Path $promptFile)) {
        Log "$($t.Id): prompt file missing ($promptFile), holding until it appears"
        Start-Sleep -Seconds 300
    }

    Log "$($t.Id): start on branch $(git -C $Repo rev-parse --abbrev-ref HEAD)"
    $dirty = git -C $Repo status --porcelain | Where-Object { $_ -match "^ ?M" }
    if ($dirty) { Log "$($t.Id): WARNING working tree has modified tracked files from another session; the task will branch on top of them" }

    $sid = ""
    $resumes = 0
    $limitStart = $null
    $contFile = Join-Path $LogDir ("{0}.continue.md" -f $t.Id)

    while ($true) {
        $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $useFile = $promptFile
        if ($sid) {
            Set-Content -Path $contFile -Encoding UTF8 -Value ("Continue task {0}. The report {1} is not yet written and committed together with the Execution/_OPEN.md rows. Finish the work, write the report following Execution/_TEMPLATE.md, add the register rows, and commit them on the task branch." -f $t.Id, $report)
            $useFile = $contFile
        }
        $r = Invoke-Claude $t.Id $t.Model $useFile $sid $stamp
        if ($r.SessionId) { $sid = $r.SessionId }

        if ($r.Kind -eq "limit") {
            if (-not $limitStart) { $limitStart = Get-Date }
            if (((Get-Date) - $limitStart).TotalHours -gt $MaxLimitHours) { Log "$($t.Id): FAILED, held on a limit for more than $MaxLimitHours h"; return $false }
            $until = if ($r.ResetAt) { $r.ResetAt.AddMinutes(2) } else { (Get-Date).AddMinutes($LimitWaitMinutes) }
            Log "$($t.Id): limit hit ($($r.Text -replace '\s+',' ')); holding until $until"
            while ((Get-Date) -lt $until) { Start-Sleep -Seconds 60 }
            continue   # resume the same session, so no work is lost
        }
        $limitStart = $null

        if (Committed $report) { Log "$($t.Id): done, report committed"; return $true }

        if ($r.Kind -eq "error") { Log "$($t.Id): claude exited with an error: $($r.Text -replace '\s+',' ')" }
        else { Log "$($t.Id): claude finished but the report is not committed" }

        if ($resumes -ge $MaxResumes -or -not $sid) { Log "$($t.Id): FAILED after $resumes resume(s); queue stops here"; return $false }
        $resumes++
        Log "$($t.Id): resume $resumes of $MaxResumes"
    }
}

Log "queue start (pid $PID), repo $Repo"
Wait-ForGate
foreach ($t in $Tasks) {
    $ok = Run-Task $t
    if (-not $ok) {
        Set-Content -Path (Join-Path $QueueDir "FAILED.txt") -Value ("{0} {1}" -f (Get-Date -Format s), $t.Id) -Encoding UTF8
        Log "queue stopped at $($t.Id); fix, then relaunch (done tasks are skipped)"
        exit 1
    }
}
Set-Content -Path (Join-Path $QueueDir "ALL_DONE.txt") -Value (Get-Date -Format s) -Encoding UTF8
Log "queue complete: T056..T061 reports committed"
