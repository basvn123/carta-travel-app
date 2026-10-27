@echo off
REM Twice-yearly Booking.com + Hostelworld list-price scrape (T532), owner's laptop.
REM
REM Owner decision 2026-10-21: scraped in March and September for star class,
REM dorm beds and the towns Xotelo misses. One plain browser tab per site, 3 to 6 s
REM per page, stops on a block and resumes the next night. Only medians are published.
REM
REM   scripts\stays_scrape.bat               both sites, side by side (the season task)
REM   scripts\stays_scrape.bat booking       Booking only     (log logs\stays_booking.log)
REM   scripts\stays_scrape.bat hostelworld   Hostelworld only (log logs\stays_hostelworld.log)
REM One site per task (T679) means a stuck or failing site never holds the other back.
REM
REM Scheduled by scripts\stays_scrape_task.ps1 as CartaStayScrape, nightly 01:00.
REM This file only does work in March and September (or with FORCE=1), and stops
REM after 6 hours; each run resumes from cache\stays\journal_scrape.sqlite.
REM When a run finishes it uploads that journal to the private R2 bucket
REM (state/journal_scrape.sqlite), where the monthly Actions build reads it.
REM
REM Needs: pip install playwright httpx
REM        Node with wrangler logged in (npx wrangler whoami), for the R2 upload (T742).
REM Manual run any month:  set FORCE=1 ^&^& scripts\stays_scrape.bat
REM A run that spans two months keeps one tag (else the second month starts the
REM plan again):  set STAYS_RUN=2026-10 before calling this file.
cd /d "%~dp0.."
if not exist "logs" mkdir "logs"
set "SITE=%~1"
if "%SITE%"=="" set "SITE=both"
if /i not "%SITE%"=="both" if /i not "%SITE%"=="booking" if /i not "%SITE%"=="hostelworld" (
  echo usage: stays_scrape.bat [both^|booking^|hostelworld]
  exit /b 2
)
set "LOG=%CD%\logs\stays_scrape.log"
if /i "%SITE%"=="booking" set "LOG=%CD%\logs\stays_booking.log"
if /i "%SITE%"=="hostelworld" set "LOG=%CD%\logs\stays_hostelworld.log"

for /f %%m in ('powershell -NoProfile -Command "Get-Date -Format MM"') do set "MON=%%m"
for /f %%y in ('powershell -NoProfile -Command "Get-Date -Format yyyy"') do set "YEAR=%%y"
for /f %%s in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set "DAY=%%s"
if not "%FORCE%"=="1" (
  if not "%MON%"=="03" if not "%MON%"=="09" exit /b 0
)
set "RUN=%YEAR%-%MON%"
if defined STAYS_RUN set "RUN=%STAYS_RUN%"

REM Its own browser folder (T646): another project's Playwright install deletes
REM the browsers it does not use from the shared folder, which killed a run on
REM 2026-10-23. Installing is a no-op when the browsers are already there.
set "PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\ms-playwright-carta-stays"
REM UTF-8 output (T741): a town name with a letter outside cp1252 crashed the log line.
set "PYTHONIOENCODING=utf-8"
python -m playwright install chromium chromium-headless-shell >nul 2>&1

echo. >> "%LOG%"
echo ==== stays scrape %RUN% %SITE% started %DATE% %TIME% ==== >> "%LOG%"
REM Booking turns away headless Chrome (T624), so it runs headed, in a window
REM placed off-screen (T634); --show to watch it.
if /i "%SITE%"=="booking" (
  python pipeline\stays\scrape_booking.py --run %RUN% --max-hours 6 --headed >> "%LOG%" 2>&1
  goto upload
)
if /i "%SITE%"=="hostelworld" (
  python pipeline\stays\scrape_hostelworld.py --run %RUN% --max-hours 6 >> "%LOG%" 2>&1
  goto upload
)
REM Both: different sites, so side by side (T646) and Booking has the whole night.
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

:upload
REM Upload (T742) through wrangler, which is logged in on this laptop; the rclone
REM key in RCLONE_CONFIG_R2_* is refused (403) on carta-stays-state. Same rules as
REM T646/T679: a consistent snapshot of the journal (the other site's scraper may
REM be writing it), never replace R2's copy with one that has fewer rows, keep one
REM backup of R2's copy per day, and skip the upload when nothing is new (the
REM idle task runs every hour).
set "BUCKET=carta-stays-state/state"
set "SNAP=cache\stays\journal_scrape.upload-%SITE%.sqlite"
set "REMOTE_COPY=cache\stays\journal_scrape.remote-%SITE%.sqlite"
if exist "%SNAP%" del "%SNAP%"
if exist "%REMOTE_COPY%" del "%REMOTE_COPY%"
python -c "import sqlite3,sys; src=sqlite3.connect(sys.argv[1], timeout=60); dst=sqlite3.connect(sys.argv[2]); src.backup(dst); dst.close()" "cache\stays\journal_scrape.sqlite" "%SNAP%" >> "%LOG%" 2>&1
if not exist "%SNAP%" (
  echo upload skipped: no snapshot of the journal >> "%LOG%"
  goto finish
)
pushd continent-app
call npx wrangler whoami >nul 2>&1
call npx wrangler r2 object get "%BUCKET%/journal_scrape.sqlite" --remote --file "..\%REMOTE_COPY%" >nul 2>&1
REM A failed get (no copy on R2 yet) can leave an empty file: not a journal.
if errorlevel 1 if exist "..\%REMOTE_COPY%" del "..\%REMOTE_COPY%"
popd
python -c "import os,sqlite3,sys; n=lambda p: sqlite3.connect(p).execute('select count(*) from obs').fetchone()[0]; a=n(sys.argv[1]); b=n(sys.argv[2]) if os.path.exists(sys.argv[2]) else 0; print('journal rows: snapshot', a, 'R2', b); sys.exit(3 if a == b else 1 if a < b else 0)" "%SNAP%" "%REMOTE_COPY%" >> "%LOG%" 2>&1
if errorlevel 3 (
  echo upload skipped: R2 already has these rows >> "%LOG%"
  goto finish
)
if errorlevel 1 (
  echo upload refused: the snapshot has fewer rows than R2's >> "%LOG%"
  goto finish
)
pushd continent-app
if exist "..\%REMOTE_COPY%" call npx wrangler r2 object put "%BUCKET%/backup/journal_scrape-%DAY%.sqlite" --remote --file "..\%REMOTE_COPY%" >> "%LOG%" 2>&1
call npx wrangler r2 object put "%BUCKET%/journal_scrape.sqlite" --remote --file "..\%SNAP%" >> "%LOG%" 2>&1
popd
:finish
if exist "%SNAP%" del "%SNAP%"
if exist "%REMOTE_COPY%" del "%REMOTE_COPY%"
echo ==== stays scrape %RUN% %SITE% done %DATE% %TIME% ==== >> "%LOG%"
exit /b 0
