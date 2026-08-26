# scripts/install-leadgen-worker-task.ps1
#
# Registers a Windows Scheduled Task that runs the local leadgen job-queue
# worker every 2 minutes, so queued ZIP-discovery and email-crawl jobs drain
# within ~2 minutes of being enqueued instead of waiting for the once-daily
# Vercel cron.
#
# The task runs `node scripts/leadgen-worker.mjs` (a single drain pass per
# invocation) from the repo working directory. The Postgres `FOR UPDATE SKIP
# LOCKED` claim means this local worker and the Vercel cron can run
# concurrently without double-processing a job.
#
# It only starts when the owner is logged in (interactive), which matches "my
# machine is on most of the day." When the machine is asleep/off, pending jobs
# simply wait in Postgres for the next wake / the Vercel cron fallback.
#
# Run:  powershell -ExecutionPolicy Bypass -File scripts/install-leadgen-worker-task.ps1

$Repo = "C:\dev\SimpleITSRQ\simpleitsrq-web"
$Node = "C:\Program Files\nodejs\node.exe"

$action  = New-ScheduledTaskAction -Execute $Node `
  -Argument "--env-file=$Repo\.env.local $Repo\scripts\leadgen-worker.mjs --once" `
  -WorkingDirectory $Repo

# Start now and repeat every 2 minutes, indefinitely, for a day's worth of runs.
$start  = Get-Date
$trigger = New-ScheduledTaskTrigger -Once -At $start `
  -RepetitionInterval (New-TimeSpan -Minutes 2) `
  -RepetitionDuration (New-TimeSpan -Days 1)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
  -TaskName "SimpleITSRQ Leadgen Worker" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Drain the simpleitsrq.com leadgen job queue (ZIP discovery + email crawl) every 2 minutes from the local machine." `
  -Force

Write-Host "Registered 'SimpleITSRQ Leadgen Worker'. It runs every 2 minutes while logged in."
