@echo off
REM Twice-yearly Booking.com + Hostelworld list-price scrape (T532), owner's laptop.
REM
REM Owner decision 2026-10-21: scraped in March and September for star class,
REM dorm beds and the towns Xotelo misses. One plain browser tab per site, 3 to 6 s
REM per page, stops on a block and resumes the next night. Only medians are published.
REM
REM Scheduled by scripts\stays_scrape_task.ps1 as CartaStayScrape, nightly 01:00.
REM This file only does work in March and September (or with FORCE=1), and stops
REM after 6 hours; each night resumes from cache\stays\journal_scrape.sqlite.
REM When a night finishes it uploads that journal to the private R2 bucket
REM (state/journal_scrape.sqlite), where the monthly Actions build reads it.
REM
REM Needs: pip install playwright httpx
REM        rclone, with the five RCLONE_CONFIG_R2_* variables set (T045).
REM Manual run any month:  set FORCE=1 ^&^& scripts\stays_scrape.bat
REM A run that spans two months keeps one tag (else the second month starts the
REM plan again):  set STAYS_RUN=2026-10 before calling this file.
cd /d "%~dp0.."
if not exist "logs" mkdir "logs"
set "LOG=%CD%\logs\stays_scrape.log"

for /f %%m in ('powershell -NoProfile -Command "Get-Date -Format MM"') do set "MON=%%m"
for /f %%y in ('powershell -NoProfile -Command "Get-Date -Format yyyy"') do set "YEAR=%%y"
for /f %%s in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set "STAMP=%%s"
if not "%FORCE%"=="1" (
  if not "%MON%"=="03" if not "%MON%"=="09" exit /b 0
)
set "RUN=%YEAR%-%MON%"
if defined STAYS_RUN set "RUN=%STAYS_RUN%"

REM Its own browser folder (T646): another project's Playwright install deletes
REM the browsers it does not use from the shared folder, which killed a run on
REM 2026-10-23. Installing is a no-op when the browsers are already there.
set "PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\ms-playwright-carta-stays"
python -m playwright install chromium chromium-headless-shell >nul 2>&1

echo. >> "%LOG%"
echo ==== stays scrape %RUN% started %DATE% %TIME% ==== >> "%LOG%"
REM Booking and Hostelworld are different sites, so they run side by side (T646)
REM and Booking has the whole night. Booking turns away headless Chrome (T624),
REM so it runs headed, in a window placed off-screen (T634); --show to watch it.
if exist "logs\stays_hw.done" del "logs\stays_hw.done"
start "carta-hostelworld" /b cmd /c "python pipeline\stays\scrape_hostelworld.py --run %RUN% --max-hours 6 > logs\stays_hw.log 2>&1 & echo done> logs\stays_hw.done"
python pipeline\stays\scrape_booking.py --run %RUN% --max-hours 6 --headed >> "%LOG%" 2>&1
:wait_hw
if exist "logs\stays_hw.done" goto hw_done
ping -n 31 127.0.0.1 >nul
goto wait_hw
:hw_done
type "logs\stays_hw.log" >> "%LOG%"
del "logs\stays_hw.done"

where rclone >nul 2>&1
if errorlevel 1 (
  echo rclone not found: journal not uploaded >> "%LOG%"
  exit /b 0
)
REM Safe upload (T646). The journal is written in WAL mode: checkpoint it, or the
REM copy misses the newest rows. Keep a dated copy of the remote one on R2, and
REM never replace it with a journal that has fewer rows (another machine's run,
REM or a restored older copy).
set "REMOTE=r2:carta-stays-state/state/journal_scrape.sqlite"
set "REMOTE_COPY=cache\stays\journal_scrape.remote.sqlite"
if exist "%REMOTE_COPY%" del "%REMOTE_COPY%"
rclone copyto "%REMOTE%" "%REMOTE_COPY%" >> "%LOG%" 2>&1
if exist "%REMOTE_COPY%" rclone copyto "%REMOTE%" "r2:carta-stays-state/state/backup/journal_scrape-%STAMP%.sqlite" >> "%LOG%" 2>&1
python -c "import os,sqlite3,sys; l=sqlite3.connect(sys.argv[1]); l.execute('pragma wal_checkpoint(TRUNCATE)'); n=lambda c: c.execute('select count(*) from obs').fetchone()[0]; a=n(l); b=n(sqlite3.connect(sys.argv[2])) if os.path.exists(sys.argv[2]) else 0; print('journal rows: local', a, 'remote', b); sys.exit(1 if a < b else 0)" "cache\stays\journal_scrape.sqlite" "%REMOTE_COPY%" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo upload refused: the local journal has fewer rows than R2's >> "%LOG%"
  exit /b 1
)
rclone copyto "cache\stays\journal_scrape.sqlite" "%REMOTE%" >> "%LOG%" 2>&1
echo ==== stays scrape %RUN% done %DATE% %TIME% ==== >> "%LOG%"
