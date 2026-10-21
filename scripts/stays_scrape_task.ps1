# Register the nightly CartaStayScrape task (T532). Run once, as the owner, in a
# normal (non-admin) PowerShell from the repo root:
#
#   powershell -ExecutionPolicy Bypass -File scripts\stays_scrape_task.ps1
#
# The task fires every night at 01:00; scripts\stays_scrape.bat exits at once
# outside March and September, so it costs nothing the rest of the year.
# Remove it with:  Unregister-ScheduledTask -TaskName CartaStayScrape -Confirm:$false

$bat = Join-Path (Resolve-Path "$PSScriptRoot\..") "scripts\stays_scrape.bat"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$bat`""
$trigger = New-ScheduledTaskTrigger -Daily -At 1:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Hours 7) -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "CartaStayScrape" -Action $action -Trigger $trigger `
    -Settings $settings -Description "Carta stay prices: Booking/Hostelworld list scrape, March and September (T532)" -Force
Write-Output "CartaStayScrape registered: nightly 01:00, works in March and September."
