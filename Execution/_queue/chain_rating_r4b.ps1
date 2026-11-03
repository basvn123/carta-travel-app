# Rating v5 chain, second version (2026-10-28): replaces chain_rating_r4.ps1, whose R4
# session went idle after the headless runner stopped its background agents.
#
#   1. R4: resumes session -ResumeId until the R4 report is committed.
#   2. Merge: runs Execution/_queue/R4-merge.prompt.md until the merge report is committed
#      (merges R1 to R4 into root main and app master, pushes main, no deploy).
#   3. Box: waits until the POI fee harvest on the Hetzner box has exited, then runs
#      Execution/_queue/R4-box.prompt.md until the box report is committed (T761-a).
#
# Every stage holds on a usage limit and resumes the same session; a session that ends
# without its report is resumed up to -MaxResumes times. Background agents are waited for
# (CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0).
#
#   powershell -File pipeline/launch_detached.ps1 Execution/_queue/chain_rating_r4b.ps1 -ResumeId <id>
#
# Log: Execution/_queue/chain_rating_r4b.log, claude output in Execution/_queue/logs/R4b.*.json

param(
    [string]$ResumeId = "",
    [string]$Claude = "",
    [string]$PermissionMode = "bypassPermissions",
    [string]$Model = "claude-opus-5-5",
    [int]$LimitWaitMinutes = 30,
    [int]$MaxLimitHours = 72,
    [int]$MaxResumes = 3,
    [int]$BoxPollMinutes = 15,
    [int]$BoxMaxHours = 48,
    [string]$From = "r4"          # r4 | merge | box
)

$ErrorActionPreference = "Continue"
$Repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $Repo "run_pipeline.py"))) {
    throw "chain_rating_r4b.ps1 must run with the repo root as working directory"
}
$QueueDir = Join-Path $Repo "Execution\_queue"
$LogDir   = Join-Path $QueueDir "logs"
$LogFile  = Join-Path $QueueDir "chain_rating_r4b.log"
New-Item -ItemType Directory -Force $LogDir | Out-Null
$env:CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "0"

$BoxHost = "carta@46.225.237.75"
$BoxKey  = Join-Path $env:USERPROFILE ".ssh\carta_orchestrator_ed25519"

function Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    [Console]::Out.WriteLine($line)
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

$others = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -match "chain_rating_r4b?(\.\d{8}_\d{6})?\.ps1"
}
if ($others) {
    Log ("refusing to start: a rating chain is already running as pid " + (($others | ForEach-Object { $_.ProcessId }) -join ", "))
    exit 2
}

try {
    Add-Type -Name Power -Namespace CartaChainB -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
    [CartaChainB.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null
    Log "power: system-required flag set"
} catch { Log "power: could not set execution state ($($_.Exception.Message))" }

if (-not $Claude) {
    $ext = Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory -Filter "anthropic.claude-code-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($ext) { $Claude = Join-Path $ext.FullName "resources\native-binary\claude.exe" }
}
if (-not $Claude -or -not (Test-Path $Claude)) { throw "claude CLI not found; pass -Claude <path to claude.exe>" }
Log "claude: $Claude  model: $Model  from: $From"

function Committed-At([string]$spec) {
    $ct = git -C $Repo log --all -1 --diff-filter=AM --format=%ct -- $spec 2>$null
    if ($ct) { return [long]$ct } else { return 0 }
}

$Common = "You are running unattended from Execution/_queue/chain_rating_r4b.ps1. Nobody can answer a question or approve anything, so never stop to ask; make the conservative call, record it under What is still open with a register row for the owner, and finish. Do the work in the foreground: do not start background agents and do not use ScheduleWakeup, because a headless turn that ends is a session that ends. Never use git add -A, git add . or git commit -a; stage files by name. Never git stash. Commit continent-app work inside the continent-app repo too. Kill any dev or preview server you start. Never deploy."

function Invoke-Claude([string]$label, [string]$inputFile, [string]$resumeId, [string]$note) {
    $stamp   = Get-Date -Format "yyyyMMdd_HHmmss"
    $outJson = Join-Path $LogDir ("R4b.{0}.{1}.json" -f $label, $stamp)
    $errLog  = Join-Path $LogDir ("R4b.{0}.{1}.err.log" -f $label, $stamp)
    $sysFile = Join-Path $LogDir ("R4b.{0}.system_note.txt" -f $label)
    Set-Content -Path $sysFile -Value $note -Encoding UTF8
    $flags = "-p --model `"$Model`" --output-format json --permission-mode $PermissionMode --append-system-prompt-file `"$sysFile`""
    if ($resumeId) { $flags += " --resume `"$resumeId`"" }
    $cmdline = "/c type `"$inputFile`" | `"$Claude`" $flags > `"$outJson`" 2> `"$errLog`""
    Log "$label run: resume=$(if($resumeId){$resumeId}else{'-'}) log=$outJson"
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

# Runs one stage until a commit adds a file matching $doneSpec after the stage started.
function Run-Stage([string]$label, [string]$promptFile, [string]$doneSpec, [string]$sid, [string]$note, [string]$continueText) {
    if (-not (Test-Path $promptFile)) { Log "FAILED: $label prompt missing: $promptFile"; exit 1 }
    if ((Committed-At $doneSpec) -gt 0) { Log "$label report already committed, skipping"; return }
    $resumes = 0; $limitSince = $null; $inFile = $promptFile
    $contFile = Join-Path $LogDir ("R4b.{0}.continue.txt" -f $label)
    Set-Content -Path $contFile -Encoding UTF8 -Value $continueText
    if ($sid) { $inFile = $contFile }
    while ($true) {
        $r = Invoke-Claude $label $inFile $sid $note
        if ($r.SessionId) { $sid = $r.SessionId }
        if ((Committed-At $doneSpec) -gt 0) { Log "$label done: report committed"; return }
        if ($r.Kind -eq "limit") {
            if (-not $limitSince) { $limitSince = Get-Date }
            if (((Get-Date) - $limitSince).TotalHours -gt $MaxLimitHours) { Log "FAILED: $label held on a limit for over $MaxLimitHours h"; exit 1 }
            $wait = if ($r.ResetAt -and $r.ResetAt -gt (Get-Date)) { ($r.ResetAt - (Get-Date)).TotalSeconds + 120 } else { $LimitWaitMinutes * 60 }
            Log ("{0} limit: holding {1:N0} min, then resuming session {2}" -f $label, ($wait / 60), $sid)
            Start-Sleep -Seconds ([int]$wait)
            $inFile = $contFile
            continue
        }
        $limitSince = $null
        if ($resumes -ge $MaxResumes) { Log "FAILED: $label ended $($resumes + 1) times without a committed report"; exit 1 }
        $resumes++
        Log "$label ended without the report, resume $resumes of $MaxResumes (session $(if($sid){$sid}else{'new'}))"
        $inFile = $contFile
    }
}

$order = @("r4", "merge", "box")
$start = [array]::IndexOf($order, $From)
if ($start -lt 0) { throw "-From must be r4, merge or box" }

if ($start -le 0) {
    Run-Stage "r4" (Join-Path $QueueDir "R4-rating-v5-screens.prompt.md") ":(glob)Execution/P7/*rating-v5-screens*.md" $ResumeId `
        "$Common The batch only counts as done when Execution/P7/T763-T766-rating-v5-screens.md (or its renumbered name ending in rating-v5-screens.md) is committed together with the Execution/_OPEN.md rows, so always reach that step. Do not merge: a later stage of the chain merges." `
        "Continue Batch R4. The headless runner stopped your two background agents (T763 one rating in the app, T764 taste profile onboarding) at 12:59; they are not running and will not report. Their uncommitted edits are still in wt/p7-rating-v5-screens-app and wt/p7-rating-v5-screens-t764-app: review them with git diff, finish that work yourself in the foreground, commit each task as its own T{n}: commit, merge the T764 app branch into the batch branch, then do T766, the end check, the report Execution/P7/T763-T766-rating-v5-screens.md and the register rows, and commit them. Do not start background agents or ScheduleWakeup again. Do not merge into main or master; the next stage of the chain does that."
}

if ($start -le 1) {
    Run-Stage "merge" (Join-Path $QueueDir "R4-merge.prompt.md") ":(glob)Execution/P7/*rating-v5-merge*.md" "" `
        "$Common The merge only counts as done when Execution/P7/T{n}-rating-v5-merge.md is committed on main together with the Execution/_OPEN.md rows." `
        "Continue the rating v5 merge from Execution/_queue/R4-merge.prompt.md. Check git log and git status in both repos for what is already merged, finish the remaining steps, and commit the report with the register rows on main."
}

if ($start -le 2) {
    Log "box: waiting for harvest_poi_fees.py on the box to exit"
    $since = Get-Date
    while ($true) {
        $out = & ssh -i $BoxKey -o BatchMode=yes -o ConnectTimeout=20 $BoxHost "pgrep -f harvest_poi_fees.py >/dev/null && echo RUNNING || echo DONE" 2>$null
        if ("$out" -match "DONE") { Log "box: harvest finished"; break }
        if (((Get-Date) - $since).TotalHours -gt $BoxMaxHours) { Log "FAILED: box harvest still running after $BoxMaxHours h"; exit 1 }
        Start-Sleep -Seconds ($BoxPollMinutes * 60)
    }
    Run-Stage "box" (Join-Path $QueueDir "R4-box.prompt.md") ":(glob)Execution/P7/*rating-v5-box-fees*.md" "" `
        "$Common The task only counts as done when Execution/P7/T{n}-rating-v5-box-fees.md is committed on main together with the Execution/_OPEN.md rows." `
        "Continue Execution/_queue/R4-box.prompt.md. Check git log, the box state and the register for what is done, finish the rest and commit the report with the register rows on main."
}
Log "chain complete"
