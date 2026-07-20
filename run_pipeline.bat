@echo off
REM Non-interactive weekly data refresh for a Windows Scheduled Task.
REM Runs every pipeline task that is DUE (fares weekly; fame/rating monthly;
REM open-data snapshots quarterly) then rebuilds the app. Output goes to
REM logs\pipeline_<date>.log (run_pipeline.py also tees there). No pauses.
REM
REM One-time setup (replaces the old fares-only task) - run in an admin shell:
REM   schtasks /Create /TN "CartaDataPipeline" /TR "\"%~f0\"" /SC WEEKLY /D SUN /ST 03:00 /RL LIMITED /F
REM   schtasks /Delete /TN "TravelAppFareRefresh" /F   REM old task refreshed the wrong (legacy) fares
REM
REM Manual one-off from a normal shell:  run_pipeline.bat
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
