@echo off
REM Double-click to refresh all Ryanair fares with live prices and rebuild the app.
REM Re-fetches ~1000 fares for a rolling [today .. today+150 days / ~5 months] window (~20 min).
cd /d "%~dp0"

echo ============================================================
echo  Refreshing Ryanair fares (live re-fetch, this takes ~20 min)
echo ============================================================
python reharvest_flights.py refresh
if errorlevel 1 (
  echo.
  echo  Fare refresh FAILED - see the messages above. App not rebuilt.
  pause
  exit /b 1
)

echo.
echo  Rebuilding the app with the fresh fares...
cd continent-app
call npm run build
if errorlevel 1 (
  echo.
  echo  Build FAILED - fares were refreshed but the app was not rebuilt.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Done. Fresh fares are live in the app.
echo ============================================================
pause
