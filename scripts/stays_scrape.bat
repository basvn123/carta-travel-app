@echo off
REM Twice-yearly Booking.com + Hostelworld list-price scrape (T513), owner's laptop.
REM
REM Owner decision 2026-10-21: scraped in March and September for star class,
REM dorm beds and the towns Xotelo misses. One plain browser tab, 3 to 6 s per
REM page, stops on a block and resumes the next night. Only medians are published.
REM
REM Scheduled by scripts\stays_scrape_task.ps1 as CartaStayScrape, nightly 01:00.
REM This file only does work in March and September (or with FORCE=1), and stops
REM after 6 hours; each night resumes from cache\stays\journal_scrape.sqlite.
REM When a night finishes it uploads that journal to the private R2 bucket
REM (state/journal_scrape.sqlite), where the monthly Actions build reads it.
REM
REM Needs: pip install playwright httpx ^&^& python -m playwright install chromium
REM        rclone, with the five RCLONE_CONFIG_R2_* variables set (T045).
REM Manual run any month:  set FORCE=1 ^&^& scripts\stays_scrape.bat
cd /d "%~dp0.."
if not exist "logs" mkdir "logs"
set "LOG=%CD%\logs\stays_scrape.log"

for /f %%m in ('powershell -NoProfile -Command "Get-Date -Format MM"') do set "MON=%%m"
for /f %%y in ('powershell -NoProfile -Command "Get-Date -Format yyyy"') do set "YEAR=%%y"
if not "%FORCE%"=="1" (
  if not "%MON%"=="03" if not "%MON%"=="09" exit /b 0
)
set "RUN=%YEAR%-%MON%"

echo. >> "%LOG%"
echo ==== stays scrape %RUN% started %DATE% %TIME% ==== >> "%LOG%"
python pipeline\stays\scrape_booking.py --run %RUN% --max-hours 4.5 >> "%LOG%" 2>&1
python pipeline\stays\scrape_hostelworld.py --run %RUN% --max-hours 1.5 >> "%LOG%" 2>&1

where rclone >nul 2>&1
if errorlevel 1 (
  echo rclone not found: journal not uploaded >> "%LOG%"
  exit /b 0
)
rclone copyto "cache\stays\journal_scrape.sqlite" "r2:carta-stays-state/state/journal_scrape.sqlite" >> "%LOG%" 2>&1
echo ==== stays scrape %RUN% done %DATE% %TIME% ==== >> "%LOG%"
