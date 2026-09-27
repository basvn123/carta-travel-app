@echo off
REM Non-interactive weekly data refresh for a Windows Scheduled Task.
REM Runs every pipeline task that is DUE (fares weekly; fame/rating monthly;
REM open-data snapshots quarterly) then rebuilds the app. Output goes to
REM logs\pipeline_<date>.log (run_pipeline.py also tees there). No pauses.
REM
REM Scheduled since 2026-07-31 via the existing weekly task (no admin needed):
REM   TravelAppFareRefresh, Mon 09:00, Task To Run -> this file.
REM   (It previously ran the deleted legacy refresh_fares_scheduled.bat.)
REM
REM Manual one-off from a normal shell:  run_pipeline.bat
REM
REM Successor (T048): infra/hetzner/cax11/run_pipeline.sh on the Linux
REM orchestrator, run by carta-weekly.timer (infra/hetzner/cron/) in the same
REM Monday 09:00 slot. This file and the Windows task stay the live schedule
REM until the owner disables TravelAppFareRefresh, which happens only after the
REM box's wire has passed compare_wire.py against a laptop build
REM (Execution/P3/_OPEN-hetzner.md). Re-enable it with:
REM   schtasks /Change /TN TravelAppFareRefresh /ENABLE
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set "LOG=%~dp0logs\pipeline_run.log"

echo. >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo  Pipeline started %DATE% %TIME% >> "%LOG%"
echo ============================================================ >> "%LOG%"

python run_pipeline.py >> "%LOG%" 2>&1
if errorlevel 1 (
  echo  Pipeline reported a FAILURE %DATE% %TIME% - see log above. >> "%LOG%"
  exit /b 1
)

echo  Pipeline done %DATE% %TIME%. >> "%LOG%"
exit /b 0
