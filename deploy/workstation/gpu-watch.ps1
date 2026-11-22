# SOLACE GPU WATCH -- keeps an eye on the 3090 Ti's memory for the Survivorz month (Josh, Nov 1 2026:
# "a watcher that watches and maintains my gpu memory and lets me know if a restart is needed").
#
# Once a minute it reads the card's memory and the biggest users of it (the model, Windows' desktop
# compositor dwm, the stream's Edge ...), writes a line to gpu-watch.csv beside the installed copy,
# and posts the sample to the Solace server on the stream token. The server judges it
# (src/survivorz/gpurule.ts): when dwm has crept past 3 GB, or the card is nearly full, the health
# check "Workstation GPU memory" goes red and Sterling DMs you. It also pops a Windows notification
# here, once per change. If this watcher stops reporting for 10 minutes, the check goes red too.
#
# What it can't do: shrink dwm. Only a restart does that (Oct 31: dwm at 8.6 GB after a long uptime
# starved the stream; after a reboot it held 0.8 GB). The stream rig already replaces its own Edge when
# that page bloats, so this watches and tells rather than killing anything.
#
#   powershell -ExecutionPolicy Bypass -File deploy\workstation\gpu-watch.ps1 -Install    register + start
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.solace-gpu\gpu-watch.ps1" -Status
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.solace-gpu\gpu-watch.ps1" -Uninstall
#
# Like the GPU supervisor, the installed copy lives in %USERPROFILE%\.solace-gpu and runs from Task
# Scheduler: anything a Claude session starts dies with the app, and the app's AppData is private.
param([switch]$Install, [switch]$Uninstall, [switch]$Status, [switch]$Once, [string]$Repo = "")
$ErrorActionPreference = "Stop"
$Home0 = Join-Path $env:USERPROFILE ".solace-gpu"
$Task = "Solace GPU Watch"
$Log = Join-Path $Home0 "gpu-watch.csv"
$RepoFile = Join-Path $Home0 "gpu-watch.repo"
$Every = 60

function Repo-Root {
  if ($Repo) { return $Repo }
  if (Test-Path $RepoFile) { return (Get-Content $RepoFile -Raw).Trim() }
  return (Resolve-Path "$PSScriptRoot\..\..").Path
}

function Read-Env($root) {
  $vals = @{}
  $f = Join-Path $root ".env"
  if (Test-Path $f) {
    foreach ($line in Get-Content $f) {
      if ($line -match '^\s*(SURVIVORZ_[A-Z_]+)\s*=\s*(.*)$') { $vals[$Matches[1]] = $Matches[2].Trim().Trim('"') }
    }
  }
  $vals
}

function Measure-Gpu {
  $q = (& nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits) -split ','
  $used = [int]$q[0].Trim(); $total = [int]$q[1].Trim()
  $byPid = @{}
  $samples = (Get-Counter '\GPU Process Memory(*)\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples
  foreach ($s in $samples) {
    if ($s.InstanceName -match '^pid_(\d+)_') { $p = [int]$Matches[1]; $byPid[$p] = ($byPid[$p] + $s.CookedValue) }
  }
  $byName = @{}
  foreach ($p in $byPid.Keys) {
    $mb = [math]::Round($byPid[$p] / 1MB)
    if ($mb -lt 50) { continue }
    $n = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
    if (-not $n) { $n = "pid$p" }
    $byName[$n] = ($byName[$n] + $mb)
  }
  $procs = @($byName.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | ForEach-Object { @{ name = $_.Key; mb = [int]$_.Value } })
  @{ usedMb = $used; totalMb = $total; procs = $procs }
}

function Toast($title, $text) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $t = $xml.GetElementsByTagName("text")
    $t.Item(0).AppendChild($xml.CreateTextNode($title)) | Out-Null
    $t.Item(1).AppendChild($xml.CreateTextNode($text)) | Out-Null
    $app = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
  } catch { }
}

function Post($server, $token, $body) {
  try {
    $r = Invoke-RestMethod -Method Post -Uri "$server/api/survivorz/gpu" -TimeoutSec 15 -ContentType "application/json" `
      -Headers @{ Authorization = "Bearer $token" } -Body ($body | ConvertTo-Json -Depth 4 -Compress)
    return $r
  } catch { return $null }
}

function Tick($state) {
  $root = Repo-Root
  $env0 = Read-Env $root
  $server = if ($env0["SURVIVORZ_SERVER"]) { $env0["SURVIVORZ_SERVER"].TrimEnd('/') } else { "https://solace.zone" }
  $token = $env0["SURVIVORZ_STREAM_TOKEN"]
  $s = Measure-Gpu
  $dwm = ($s.procs | Where-Object { $_.name -eq "dwm" } | ForEach-Object { $_.mb } | Measure-Object -Sum).Sum
  $level = "unsent"; $detail = ""
  if ($token) {
    $r = Post $server $token $s
    if ($r -and $r.verdict) { $level = $r.verdict.level; $detail = $r.verdict.detail } else { $level = "post-failed" }
  } else { $level = "no-token" }
  $top = ($s.procs | Select-Object -First 4 | ForEach-Object { "$($_.name)=$($_.mb)" }) -join ' '
  if (-not (Test-Path $Log)) { "time,used_mb,total_mb,dwm_mb,level,top" | Set-Content -Encoding utf8 $Log }
  elseif ((Get-Item $Log).Length -gt 20MB) { Move-Item -Force $Log "$Log.old"; "time,used_mb,total_mb,dwm_mb,level,top" | Set-Content -Encoding utf8 $Log }
  "$(Get-Date -Format s),$($s.usedMb),$($s.totalMb),$([int]$dwm),$level,$top" | Add-Content -Encoding utf8 $Log
  # a Windows notification once per change into an alarm (Sterling's DM is the other half)
  $alarm = $level -eq "restart" -or $level -eq "full"
  if ($alarm -and $state.last -ne $level) { Toast ($(if ($level -eq "restart") { "Solace: restart the PC" } else { "Solace: GPU memory nearly full" })) $detail }
  $state.last = $level
}

if ($Install) {
  New-Item -ItemType Directory -Force $Home0 | Out-Null
  $src = $MyInvocation.MyCommand.Path
  $dst = Join-Path $Home0 "gpu-watch.ps1"
  Copy-Item -Force $src $dst
  (Resolve-Path "$PSScriptRoot\..\..").Path | Set-Content -Encoding ascii $RepoFile
  $ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $act = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" `
    -Argument "--headless `"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$dst`"" -WorkingDirectory $Home0
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $logon = New-ScheduledTaskTrigger -AtLogOn -User $user
  $every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $prin = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $Task -Action $act -Trigger @($logon, $every) -Principal $prin -Settings $set -Force | Out-Null
  Start-ScheduledTask -TaskName $Task
  Write-Output "installed '$Task' (every minute; log $Log)"
  return
}
if ($Uninstall) {
  Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue
  $env0 = Read-Env (Repo-Root)
  $server = if ($env0["SURVIVORZ_SERVER"]) { $env0["SURVIVORZ_SERVER"].TrimEnd('/') } else { "https://solace.zone" }
  if ($env0["SURVIVORZ_STREAM_TOKEN"]) { Post $server $env0["SURVIVORZ_STREAM_TOKEN"] @{ stopping = $true } | Out-Null }
  Write-Output "removed '$Task' (the server's check goes quiet)"
  return
}
if ($Status) {
  $t = Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
  Write-Output ("task : " + $(if ($t) { $t.State } else { "not installed" }))
  if (Test-Path $Log) { Write-Output "last : $((Get-Content $Log -Tail 1))" }
  return
}

$state = @{ last = "" }
if ($Once) { Tick $state; Get-Content $Log -Tail 1; return }
while ($true) {
  try { Tick $state } catch { }
  Start-Sleep -Seconds $Every
}
