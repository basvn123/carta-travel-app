#!/bin/sh
# Gate for the T074..T076 loop. Prints READY when all hold, else the blocker.
cd "C:/Users/Gebruiker/Documents/Portfolio/Travel App" || exit 1
R=Execution/P4/T073-parse-failure-queue.md
H=$(git log --all -1 --format=%H -- "$R" 2>/dev/null)
[ -z "$H" ] && { echo "BLOCKED: T073 report not committed"; exit 0; }
git cat-file -e "$H:$R" 2>/dev/null || { echo "BLOCKED: T073 report path in log but not in tree"; exit 0; }
AGE=$(( $(date +%s) - $(git log --all -1 --format=%ct -- "$R") ))
[ "$AGE" -lt 600 ] && { echo "BLOCKED: T073 committed ${AGE}s ago, want 600s quiet"; exit 0; }
# Match only a real driver (run_queue.ps1 or its dated snapshot), not this check's own command line.
cat > "$TEMP/gate_rq.ps1" <<'PS'
$n = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run_queue(\.\d{8}_\d{6})?\.ps1' -and $_.CommandLine -notmatch 'gate_rq|Win32_Process' }).Count
if ($n -gt 0) { exit 3 } else { exit 0 }
PS
powershell -NoProfile -File "$TEMP/gate_rq.ps1"; [ $? -eq 3 ] && { echo "BLOCKED: run_queue.ps1 alive"; exit 0; }
M=$(git status --porcelain | grep -c '^ \?M'); MA=$(git -C continent-app status --porcelain | grep -c '^ \?M')
[ "$M" -gt 0 -o "$MA" -gt 0 ] && { echo "BLOCKED: modified tracked files root=$M app=$MA (another session mid-task)"; exit 0; }
echo "READY: T073 committed ${AGE}s ago, root branch $(git rev-parse --abbrev-ref HEAD), app branch $(git -C continent-app rev-parse --abbrev-ref HEAD)"
