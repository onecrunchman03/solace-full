# SURVIVORZ CREATOR WORKER on the workstation (docs/survivorz/CREATOR.md).
#
# Bodies dropped into Admin Panel -> Characters are baked HERE (the 3090 Ti, Blender, headless
# Chrome) by scripts/survivorz/creator/worker.mjs, which asks solace.zone for work every 20s.
# Task Scheduler owns it, never a Claude session: a process started from the Claude app lives in
# that app's Windows job and dies with it (see solace-gpu.ps1, THE LOGON TASK).
#
#   powershell -ExecutionPolicy Bypass -File deploy\workstation\creator-worker.ps1 -Install -Token <SURVIVORZ_WORKER_TOKEN>
#   creator-worker.ps1 -Status | -Uninstall
#
# The token goes in %USERPROFILE%\.solace-gpu\worker-token (the same secret the server's .env
# carries as SURVIVORZ_WORKER_TOKEN). The log is creator-worker.log beside it.
param(
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Status,
  [string]$Token = ""
)
$ErrorActionPreference = "Stop"
$Home_ = Join-Path $env:USERPROFILE ".solace-gpu"
$Task = "Solace Creator Worker"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Worker = Join-Path $Repo "scripts\survivorz\creator\worker.mjs"
$LogFile = Join-Path $Home_ "creator-worker.log"
$TokenFile = Join-Path $Home_ "worker-token"
New-Item -ItemType Directory -Force $Home_ | Out-Null

if ($Install) {
  if ($Token) { Set-Content -Path $TokenFile -Value $Token -NoNewline -Encoding ascii }
  if (-not (Test-Path $TokenFile)) { throw "no token: pass -Token <the server's SURVIVORZ_WORKER_TOKEN>" }
  $node = (Get-Command node -ErrorAction Stop).Source
  $hidden = "$env:WINDIR\System32\conhost.exe"
  # (node straight under conhost, writing its own log: a cmd.exe redirect in a task's arguments never ran)
  $act = New-ScheduledTaskAction -Execute $hidden -Argument "--headless `"$node`" `"$Worker`" --log `"$LogFile`"" -WorkingDirectory $Repo
  $trg = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  # re-checked every 5 minutes: a worker that died is started again, a running one is left alone
  $trg.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)).Repetition
  $prin = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
  Register-ScheduledTask -TaskName $Task -Action $act -Trigger $trg -Principal $prin -Settings $set -Force | Out-Null
  Start-ScheduledTask -TaskName $Task
  Write-Output "Installed: '$Task' starts at sign-in and is re-checked every 5 minutes. Log: $LogFile"
  exit 0
}
if ($Uninstall) {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*creator\worker.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Uninstalled."
  exit 0
}
# -Status (the default)
$t = Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*creator\worker.mjs*" }
Write-Output ("Task:    " + $(if ($t) { $t.State } else { "not installed" }))
Write-Output ("Worker:  " + $(if ($p) { "running (pid $($p.ProcessId))" } else { "not running" }))
Write-Output ("Token:   " + $(if (Test-Path $TokenFile) { "set" } else { "missing" }))
if (Test-Path $LogFile) { Write-Output "--- last lines of $LogFile"; Get-Content $LogFile -Tail 8 }
