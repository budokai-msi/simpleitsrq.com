$action  = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument "--env-file=C:\dev\SimpleITSRQ\simpleitsrq-web\.env.local C:\dev\SimpleITSRQ\simpleitsrq-web\scripts\local-cron-daemon.mjs --once" -WorkingDirectory "C:\dev\SimpleITSRQ\simpleitsrq-web"
$trigger = New-ScheduledTaskTrigger -Daily -At 11:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "SimpleITSRQ Blog Publisher" -Action $action -Trigger $trigger -Settings $settings -Description "Daily AI-written blog post for simpleitsrq.com (Ollama local LLM, publish via GitHub -> Vercel)" -Force
