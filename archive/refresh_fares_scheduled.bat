@echo off
REM Non-interactive fare refresh for the Windows Scheduled Task "TravelAppFareRefresh".
REM Same work as refresh_fares.bat but NO pause prompts (would hang unattended) and
REM all output is appended to logs\fare_refresh.log. For the manual one-click run,
REM use refresh_fares.bat instead.
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set "LOG=%~dp0logs\fare_refresh.log"

echo. >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo  Refresh started %DATE% %TIME% >> "%LOG%"
echo ============================================================ >> "%LOG%"

python reharvest_flights.py refresh >> "%LOG%" 2>&1
if errorlevel 1 (
  echo  Fare refresh FAILED %DATE% %TIME% - app not rebuilt. >> "%LOG%"
  exit /b 1
)

echo  Rebuilding the app... >> "%LOG%"
cd continent-app
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 (
  echo  Build FAILED %DATE% %TIME% - fares refreshed but app not rebuilt. >> "%LOG%"
  exit /b 1
)

echo  Done %DATE% %TIME% - fresh fares are live. >> "%LOG%"
exit /b 0
