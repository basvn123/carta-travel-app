# Rating v5 chain: waits for Batch R3 (T761-T762) to commit its report, then
# runs Batch R4 (T763-T766) headless from Execution/_queue/R4-rating-v5-screens.prompt.md.
# Waiting is a git poll every few minutes, so it costs no tokens.
#
# Launch it detached, from the repo root, so it outlives VS Code:
#
#   powershell -File pipeline/launch_detached.ps1 Execution/_queue/chain_rating_r4.ps1
#
# Done means the R4 report exists in a commit on some branch (git, not the
# working tree, because R3 and R4 work in their own worktrees). Holds on a
# usage limit and resumes the same session; resumes a session that ended
# without its report up to -MaxResumes times.
#
# Log: Execution/_queue/chain_rating_r4.log, claude output in Execution/_queue/logs/R4.*.json

param(
    [string]$Claude = "",
    [string]$PermissionMode = "bypassPermissions",
    [string]$Model = "claude-opus-5-5",
    [int]$PollMinutes = 5,
    [int]$QuietMinutes = 20,     # R3 report must be this old, so its session has finished
    [int]$LimitWaitMinutes = 30,
    [int]$MaxLimitHours = 72,
    [int]$MaxResumes = 3,
    [switch]$SkipGate
)

$ErrorActionPreference = "Continue"
$Repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $Repo "run_pipeline.py"))) {
    throw "chain_rating_r4.ps1 must run with the repo root as working directory"
}
$QueueDir   = Join-Path $Repo "Execution\_queue"
$LogDir     = Join-Path $QueueDir "logs"
$LogFile    = Join-Path $QueueDir "chain_rating_r4.log"
$PromptFile = Join-Path $QueueDir "R4-rating-v5-screens.prompt.md"
New-Item -ItemType Directory -Force $LogDir | Out-Null

$GateSpec = ":(glob)Execution/P7/*rating-v5-profile*.md"
$DoneSpec = ":(glob)Execution/P7/*rating-v5-screens*.md"

function Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    [Console]::Out.WriteLine($line)
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

$others = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -match "chain_rating_r4(\.\d{8}_\d{6})?\.ps1"
}
if ($others) {
    Log ("refusing to start: chain_rating_r4 already running as pid " + (($others | ForEach-Object { $_.ProcessId }) -join ", "))
    exit 2
}

try {
    Add-Type -Name Power -Namespace CartaChain -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
    [CartaChain.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null
    Log "power: system-required flag set"
} catch { Log "power: could not set execution state ($($_.Exception.Message))" }

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
Log "claude: $Claude  model: $Model"

# Commit time (unix) of the newest commit on any branch that adds or changes a
# file matching the spec, or 0.
function Committed-At([string]$spec) {
    $ct = git -C $Repo log --all -1 --diff-filter=AM --format=%ct -- $spec 2>$null
    if ($ct) { return [long]$ct } else { return 0 }
}

$SystemNote = "You are running unattended from Execution/_queue/chain_rating_r4.ps1. Nobody can answer a question or approve anything, so never stop to ask; make the conservative call, record it under What is still open with a register row for the owner, and finish. The batch only counts as done when Execution/P7/T763-T766-rating-v5-screens.md (or its renumbered name ending in rating-v5-screens.md) is committed together with the Execution/_OPEN.md rows, so always reach that step. Do not merge or deploy. Never use git add -A, git add . or git commit -a; stage files by name. Never git stash. Commit continent-app work inside the continent-app repo too. Kill any dev or preview server you start."

function Invoke-Claude([string]$inputFile, [string]$resumeId, [string]$stamp) {
    $outJson = Join-Path $LogDir ("R4.{0}.json" -f $stamp)
    $errLog  = Join-Path $LogDir ("R4.{0}.err.log" -f $stamp)
    $sysFile = Join-Path $LogDir "R4.system_note.txt"
    Set-Content -Path $sysFile -Value $SystemNote -Encoding UTF8
    $flags = "-p --model `"$Model`" --output-format json --permission-mode $PermissionMode --append-system-prompt-file `"$sysFile`""
    if ($resumeId) { $flags += " --resume `"$resumeId`"" }
    $cmdline = "/c type `"$inputFile`" | `"$Claude`" $flags > `"$outJson`" 2> `"$errLog`""
    Log "run: resume=$(if($resumeId){$resumeId}else{'-'}) log=$outJson"
    $proc = Start-Process cmd -ArgumentList $cmdline -WorkingDirectory $Repo -WindowStyle Hidden -PassThru
    $ours = @{}; if ($proc) { $ours[[int]$proc.Id] = $true }
    while (-not $proc.HasExited) {
        $snap = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
        for ($pass = 0; $pass -lt 6; $pass++) {
            foreach ($row in $snap) { if ($ours[[int]$row.ParentProcessId]) { $ours[[int]$row.ProcessId] = $true } }
        }
        Start-Sleep -Seconds 10
    }
    $live = Get-CimInstance Win32_Process | Select-Object ProcessId, Name, CommandLine
    foreach ($o in ($live | Where-Object { $ours[[int]$_.ProcessId] -and $_.CommandLine -match "vite (preview|dev)|npm run (dev|preview)" })) {
        Log "cleanup: killing leftover $($o.Name) pid $($o.ProcessId)"; Stop-Process -Id $o.ProcessId -Force -ErrorAction SilentlyContinue
    }
    $text = ""; $sid = ""
    if (Test-Path $outJson) {
        $raw = Get-Content -Raw $outJson -ErrorAction SilentlyContinue
        try { $j = $raw | ConvertFrom-Json; $text = [string]$j.result; $sid = [string]$j.session_id } catch { $text = [string]$raw }
    }
    $err = if (Test-Path $errLog) { Get-Content -Raw $errLog -ErrorAction SilentlyContinue } else { "" }
    $all = "$text`n$err"
    if ($all -match "usage limit|hit your limit|rate limit|limit reached|limit will reset|resets at|overloaded|out of extra usage|too many requests|429|529") {
        $reset = $null
        if ($all -match "limit reached\|(\d{9,11})") { $reset = [DateTimeOffset]::FromUnixTimeSeconds([long]$Matches[1]).LocalDateTime }
        return @{ Kind = "limit"; SessionId = $sid; ResetAt = $reset }
    }
    return @{ Kind = "ended"; SessionId = $sid }
}

# 1. Wait for R3.
if (-not $SkipGate) {
    Log "gate: waiting for a committed $GateSpec, then $QuietMinutes quiet minutes"
    while ($true) {
        $ct = Committed-At $GateSpec
        if ($ct -gt 0) {
            $age = [long]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) - $ct
            if ($age -ge $QuietMinutes * 60) { Log "gate: R3 report committed $age s ago, starting R4"; break }
        }
        Start-Sleep -Seconds ($PollMinutes * 60)
    }
} else { Log "gate: skipped by flag" }

if (-not (Test-Path $PromptFile)) { Log "FAILED: prompt file missing: $PromptFile"; exit 1 }
$startedAt = [long]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
if ((Committed-At $DoneSpec) -gt 0) { Log "R4 report already committed, nothing to do"; exit 0 }

# 2. Run R4, holding on limits and resuming until its report is committed.
$sid = ""; $resumes = 0; $limitSince = $null; $inFile = $PromptFile
while ($true) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $r = Invoke-Claude $inFile $sid $stamp
    if ($r.SessionId) { $sid = $r.SessionId }
    if ((Committed-At $DoneSpec) -ge $startedAt) { Log "done: R4 report committed"; break }
    if ($r.Kind -eq "limit") {
        if (-not $limitSince) { $limitSince = Get-Date }
        if (((Get-Date) - $limitSince).TotalHours -gt $MaxLimitHours) { Log "FAILED: held on a limit for over $MaxLimitHours h"; exit 1 }
        $wait = if ($r.ResetAt -and $r.ResetAt -gt (Get-Date)) { ($r.ResetAt - (Get-Date)).TotalSeconds + 120 } else { $LimitWaitMinutes * 60 }
        Log ("limit: holding {0:N0} min, then resuming session {1}" -f ($wait / 60), $sid)
        Start-Sleep -Seconds ([int]$wait)
        $contFile = Join-Path $LogDir "R4.continue.txt"
        Set-Content -Path $contFile -Encoding UTF8 -Value "Continue Batch R4 where you stopped. Check git log in both repos for what is already committed, then finish the remaining tasks, the end check, the report and the register rows."
        $inFile = $contFile
        continue
    }
    $limitSince = $null
    if ($resumes -ge $MaxResumes) { Log "FAILED: session ended $($resumes + 1) times without a committed report; see logs/R4.*.json"; exit 1 }
    $resumes++
    Log "session ended without the report, resume $resumes of $MaxResumes"
    $contFile = Join-Path $LogDir "R4.continue.txt"
    Set-Content -Path $contFile -Encoding UTF8 -Value "Continue Batch R4. The report Execution/P7/T763-T766-rating-v5-screens.md is not committed yet. Check git log in both repos for what is done, finish the rest, run the end check, write the report following Execution/_TEMPLATE.md with the register rows, and commit them on the batch branch."
    $inFile = $contFile
}
Log "chain complete"
