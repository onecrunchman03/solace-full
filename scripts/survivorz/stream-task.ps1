# SOLACE SURVIVORZ - the stream rig as a Windows scheduled task (how to go live: STREAM-RIG.md).
#
# A weeks-long stream cannot live inside a Claude Code session: the desktop app runs every session in
# its own Windows job, and closing or updating the app kills everything the session started (that is
# what took the voices down on Oct 13). A scheduled task belongs to Windows, so it survives. It runs as
# Josh, at logon, interactive, because Edge has to draw on a real desktop to be captured.
#
#   powershell -ExecutionPolicy Bypass -File scripts\survivorz\stream-task.ps1 -Install    register the task (once)
#   powershell -ExecutionPolicy Bypass -File scripts\survivorz\stream-task.ps1 -Start      go (now)
#   powershell -ExecutionPolicy Bypass -File scripts\survivorz\stream-task.ps1 -Stop       stop, and tell the server no run is expected
#   powershell -ExecutionPolicy Bypass -File scripts\survivorz\stream-task.ps1 -Status
#   powershell -ExecutionPolicy Bypass -File scripts\survivorz\stream-task.ps1 -Uninstall
#
# What keeps it running:
#   - stream-run.ps1 (the task's action) restarts the streamer 15 s after it exits, for any reason;
#   - the task restarts stream-run.ps1 if IT fails (every minute, up to 999 times);
#   - triggers at Josh's logon AND every 5 minutes (MultipleInstances IgnoreNew: a running rig is left
#     alone; a dead one is back within 5 minutes) - so after a reboot it starts as soon as Windows signs
#     Josh in. For an unattended reboot that means automatic sign-in must be on (STREAM-RIG.md).
#   - -Stop writes a stop flag the loop honours, so the 5-minute trigger doesn't start it again.
#
# The stream key (SURVIVORZ_RTMP) and the token (SURVIVORZ_STREAM_TOKEN) are read from the repo's .env,
# never from here.
param([switch]$Install, [switch]$Uninstall, [switch]$Start, [switch]$Stop, [switch]$Status)
$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$Task = "Solace Survivorz Stream"
$StopFlag = Join-Path $env:USERPROFILE ".solace-survivorz-stream.stop"
$LogDir = Join-Path $Repo "assets\downloads\survivorz\stream"

function Stop-Rig {
  # the node streamer, then the Edge it drives (the only Edge started with this flag), then the ffmpegs it fed
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*survivorz\streamer.mjs*" -and $_.CommandLine -notlike "*--notify-stopped*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*--auto-accept-this-tab-capture*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'" | Where-Object { $_.CommandLine -like "*survivorz-%Y%m%d*" -or $_.CommandLine -like "*-f mpegts -i pipe:0*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue }
}

if ($Install) {
  $ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  # conhost --headless: no console window on the desktop the stream is drawn on
  $act = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" `
    -Argument "--headless `"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$Repo\scripts\survivorz\stream-run.ps1`"" -WorkingDirectory $Repo
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $logon = New-ScheduledTaskTrigger -AtLogOn -User $user
  $every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $prin = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $Task -Action $act -Trigger @($logon, $every) -Principal $prin -Settings $set -Force | Out-Null
  Write-Output "registered '$Task' (at logon + every 5 min, restart on failure). Start it with -Start."
}
if ($Start) {
  Remove-Item $StopFlag -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName $Task
  $env = Join-Path $Repo ".env"
  $yt = Select-String -Path $env -Pattern '^SURVIVORZ_RTMP=.+' -Quiet -ErrorAction SilentlyContinue
  Write-Output ("started -> " + $(if ($yt) { "YouTube (key from .env) + the local recording" } else { "the local recording only (no SURVIVORZ_RTMP in .env)" }))
  Write-Output "log: $LogDir\rig-$(Get-Date -Format yyyyMMdd).out.txt"
}
if ($Stop) {
  New-Item -ItemType File -Force $StopFlag | Out-Null
  Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
  Stop-Rig
  # tell the server no run is expected, so its health check (and Sterling) stay quiet
  & node "$Repo\scripts\survivorz\streamer.mjs" --notify-stopped
  Write-Output "stopped"
}
if ($Uninstall) {
  New-Item -ItemType File -Force $StopFlag | Out-Null
  Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
  Stop-Rig
  Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "unregistered '$Task'"
}
if ($Status) {
  $t = Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
  Write-Output ("task     : " + $(if ($t) { $t.State } else { "not registered" }) + $(if (Test-Path $StopFlag) { " (stop flag set)" } else { "" }))
  $p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*survivorz\streamer.mjs*" }
  Write-Output ("streamer : " + $(if ($p) { "running (pid $($p.ProcessId -join ', '))" } else { "not running" }))
  $last = Get-ChildItem $LogDir -Filter "rig-*.out.txt" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
  if ($last) { Write-Output "log      : $($last.FullName)"; Get-Content $last.FullName -Tail 12 }
}
