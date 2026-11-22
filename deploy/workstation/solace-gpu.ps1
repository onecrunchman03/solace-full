# SOLACE GPU -- the workstation's half of the house's brains (Oct 2026).
#
# Josh's 3090 Ti is the "big" engine (NPC_BRAIN_BIG_URL in prod's .env): it
# does the TALKING when it's there, and slopbot's 3080 answers whenever it
# isn't. This script keeps `ollama serve` running on this PC, and gets it out
# of the way when the card is needed for something else:
#
#   * a heavy game is running (War Thunder, Star Citizen -- the list below,
#     plus any process names in games.txt beside the installed copy), or
#   * Josh has paused it by hand (`solace-gpu.ps1 -Pause`).
#
# It also keeps ROLLO'S VOICE running (scripts\rollo\agent.py + its cloned
# voice server) by the same rules: up at logon, restarted if it dies, stopped
# for a game or a pause. His output goes to rollo.log beside this script.
#
# Stopping the server (not just unloading the model) is deliberate: an
# unreachable engine is failed over INSTANTLY by the Solace server, while a
# reachable-but-unloaded one would be warmed straight back up by its health
# check -- onto the card the game is using.
#
#   Install (copies itself + adds a hidden logon shortcut):
#     powershell -ExecutionPolicy Bypass -File deploy\workstation\solace-gpu.ps1 -Install
#   Day to day:
#     solace-gpu.ps1 -Status | -Pause | -Resume
#     solace-gpu.ps1 -ShowMode | -CasinoMode   (games no longer pause the model / they do again)
#   Remove:
#     solace-gpu.ps1 -Uninstall
#
# The installed copy lives in %LOCALAPPDATA%\solace-gpu, so a branch switch in
# the repo never changes what is running. Re-run -Install after editing this.

param(
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Pause,
  [switch]$Resume,
  [switch]$ShowMode,
  [switch]$CasinoMode,
  [switch]$Status,
  [switch]$VoicesElsewhere,
  [switch]$VoicesHere,
  [switch]$Run
)

$ErrorActionPreference = "Stop"
# HOME is in the profile, NOT AppData (Oct 13 2026). The Claude desktop app is a
# packaged (MSIX) app, and Windows gives packaged apps a PRIVATE copy of
# AppData: a -Pause or a log read from a Claude session hit that copy while the
# real supervisor (started by Task Scheduler, outside the app) used the real
# folder -- so a pause did nothing and the logs looked frozen. The profile root
# isn't virtualised, so every process sees the same files.
$Home_ = Join-Path $env:USERPROFILE ".solace-gpu"
$OldHome = Join-Path $env:LOCALAPPDATA "solace-gpu"
$PauseFlag = Join-Path $Home_ "paused"
# SHOW MODE (SURVIVORZ.md section 11): for a 24/7 stream nothing may silence the cast,
# so a game launch no longer stops the model. -Pause still works by hand.
$ShowFlag = Join-Path $Home_ "showmode"
$GamesFile = Join-Path $Home_ "games.txt"
$LogFile = Join-Path $Home_ "solace-gpu.log"
$Startup = [Environment]::GetFolderPath("Startup")
$Shortcut = Join-Path $Startup "Solace GPU.lnk"
$BootTask = "Solace GPU (boot)"
$LogonTask = "Solace GPU"
$Ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"

# Games that need the whole card. Process names, without ".exe".
$DefaultGames = @(
  "aces",          # War Thunder
  "StarCitizen"    # Star Citizen
)

# What the server runs with. Mirrors the user environment set at install, so
# the supervisor doesn't depend on a fresh logon having picked it up.
$Env_ = @{
  OLLAMA_HOST              = "0.0.0.0:11434"
  OLLAMA_MODELS            = "D:\ollama\models"
  OLLAMA_FLASH_ATTENTION   = "1"
  OLLAMA_KV_CACHE_TYPE     = "q8_0"
  OLLAMA_KEEP_ALIVE        = "-1"
  OLLAMA_NUM_PARALLEL      = "4"
}

function Log([string]$msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $LogFile -Value $line
  # Keep the log small: the last 500 lines.
  $all = Get-Content $LogFile -ErrorAction SilentlyContinue
  if ($all.Count -gt 600) { $all | Select-Object -Last 500 | Set-Content $LogFile }
}

function Games {
  $list = @($DefaultGames)
  if (Test-Path $GamesFile) {
    $list += Get-Content $GamesFile | ForEach-Object { $_.Trim() -replace "\.exe$", "" } | Where-Object { $_ -and -not $_.StartsWith("#") }
  }
  $list | Select-Object -Unique
}

function RunningGame {
  if (Test-Path $ShowFlag) { return $null }
  foreach ($g in Games) {
    if (Get-Process -Name $g -ErrorAction SilentlyContinue) { return $g }
  }
  return $null
}

function ServerUp {
  [bool](Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Ollama })
}

function StartServer {
  foreach ($k in $Env_.Keys) { [Environment]::SetEnvironmentVariable($k, $Env_[$k], "Process") }
  Start-Process -FilePath $Ollama -ArgumentList "serve" -WindowStyle Hidden | Out-Null
}

function StopServer {
  # The tray app too, if anything ever started it: it would restart the server.
  Get-Process -Name "ollama app", "ollama", "llama-server" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

# ---- ROLLO'S VOICE (Oct 2026) ------------------------------------------------
# The casino regular's ears and mouth (scripts\rollo\agent.py) live on this
# card too: Whisper + the cloned voice, about 4.5 GB. The supervisor keeps him
# running like the engine -- started at logon, restarted if he dies, stopped
# while a game needs the card or the card is paused. His body stays on the
# floor either way; only his voice comes and goes.
$RepoFile = Join-Path $Home_ "repo.txt"
# VOICES ON SLOPBOT (Oct 13 2026): the regulars' ears and cloned voices moved to
# slopbot's 3080 (deploy/slopbot/) so this card's memory goes to the 26B and
# the game. This flag tells the supervisor not to run them here.
$VoicesOff = Join-Path $Home_ "voices-elsewhere"
$RolloPy = "D:\solace-ai\rollo-venv\Scripts\python.exe"
$RolloLog = Join-Path $Home_ "rollo.log"
$RolloErr = Join-Path $Home_ "rollo.err.log"

function RolloProcs {
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*rollo*agent.py*" -or $_.CommandLine -like "*rollo*voice_server.py*" }
}

function RolloUp {
  [bool](RolloProcs | Where-Object { $_.CommandLine -like "*agent.py*" })
}

function RolloWanted {
  (Test-Path $RepoFile) -and (Test-Path $RolloPy) -and -not (Test-Path $VoicesOff)
}

function StartRollo {
  $repo = (Get-Content $RepoFile -TotalCount 1).Trim()
  # Keep the logs small: start fresh once one passes 5 MB.
  foreach ($f in @($RolloLog, $RolloErr)) {
    if ((Test-Path $f) -and (Get-Item $f).Length -gt 5MB) { Move-Item $f "$f.old" -Force }
  }
  [Environment]::SetEnvironmentVariable("PYTHONIOENCODING", "utf-8", "Process")
  Start-Process -FilePath $RolloPy -ArgumentList "-u", "scripts\rollo\agent.py" -WorkingDirectory $repo `
    -WindowStyle Hidden -RedirectStandardOutput $RolloLog -RedirectStandardError $RolloErr | Out-Null
}

function StopRollo {
  # The agent AND the cloned voice it started -- killing the parent alone
  # leaves the voice server holding 3 GB of the card.
  RolloProcs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if (-not (Test-Path $Home_)) { New-Item -ItemType Directory -Path $Home_ | Out-Null }

if ($Install) {
  if (-not (Test-Path $Ollama)) { throw "Ollama isn't installed at $Ollama" }
  Copy-Item -Path $PSCommandPath -Destination (Join-Path $Home_ "solace-gpu.ps1") -Force
  # Moving from the old AppData home: keep the games list.
  if ((Test-Path (Join-Path $OldHome "games.txt")) -and -not (Test-Path $GamesFile)) {
    Copy-Item (Join-Path $OldHome "games.txt") $GamesFile
  }
  # Where Rollo's agent lives (the repo this was installed from).
  Set-Content -Path $RepoFile -Value (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
  if (-not (Test-Path $GamesFile)) {
    @("# One process name per line (without .exe). While any of these is running,",
      "# the 3090 Ti is handed back and Solace's characters fall back to scripted lines",
      "# (slopbot carries no model since Oct 13 2026 -- its card holds the voices).",
      "# War Thunder (aces) and Star Citizen are built in.") | Set-Content $GamesFile
  }
  foreach ($k in $Env_.Keys) { [Environment]::SetEnvironmentVariable($k, $Env_[$k], "User") }
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($Shortcut)
  $lnk.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $Home_ 'solace-gpu.ps1')`" -Run"
  $lnk.WindowStyle = 7
  $lnk.Description = "Keeps Solace's NPC engine running on this GPU, out of the way of games"
  $lnk.Save()
  # THE BOOT TASK (Oct 2026, Josh: "I don't want to have to manually restart
  # anything"): the same supervisor at power-on, signed in or not -- a power
  # cut or an update restart no longer leaves the engine and the regulars'
  # voices down until somebody logs on. S4U = runs as this user without
  # storing a password (it needs nothing off the network that asks for one).
  # Registering it needs an ELEVATED -Install; the logon shortcut above stays
  # as the fallback, and the mutex in -Run keeps it to one supervisor.
  try {
    $act = New-ScheduledTaskAction -Execute $lnk.TargetPath -Argument $lnk.Arguments
    $trg = New-ScheduledTaskTrigger -AtStartup
    $trg.Delay = "PT45S"
    $prin = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
    $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
    Register-ScheduledTask -TaskName $BootTask -Action $act -Trigger $trg -Principal $prin -Settings $set -Force -ErrorAction Stop | Out-Null
    Write-Output "Boot task registered: the supervisor starts at power-on, signed in or not."
  } catch {
    Write-Output "Boot task NOT registered (run -Install from an elevated PowerShell for that): $($_.Exception.Message)"
  }
  # THE LOGON TASK + WATCHDOG (Oct 13 2026). The supervisor must never be a
  # child of whatever ran -Install: a process started from a Claude Code
  # session lives in that app's Windows JOB, and closing the app (or the
  # session ending) kills the whole job -- that is how the engine and the
  # regulars' voices died at 13:57 on Oct 13 with nothing in the log. Task
  # Scheduler owns this one instead: at logon, then re-checked every 5 minutes
  # (a dead supervisor is back within 5; a live one makes the check a no-op --
  # IgnoreNew, and the mutex in -Run). conhost --headless so a check never
  # flashes a window over a full-screen game. No elevation needed.
  try {
    $hidden = "$env:WINDIR\System32\conhost.exe"
    $args_ = "--headless `"$($lnk.TargetPath)`" $($lnk.Arguments)"
    $act = New-ScheduledTaskAction -Execute $hidden -Argument $args_
    $trg = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $trg.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)).Repetition
    $prin = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew `
      -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
    Register-ScheduledTask -TaskName $LogonTask -Action $act -Trigger $trg -Principal $prin -Settings $set -Force -ErrorAction Stop | Out-Null
    Write-Output "Logon task registered: started by Task Scheduler at sign-in, re-checked every 5 minutes."
  } catch {
    Write-Output "Logon task NOT registered: $($_.Exception.Message)"
  }
  Log "installed"
  # Hand the running supervisor to Task Scheduler: stop whatever copy is up
  # (it may be inside somebody's job) and start the task's own.
  if (Get-ScheduledTask -TaskName $LogonTask -ErrorAction SilentlyContinue) {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*solace-gpu.ps1*-Run*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    StopServer
    StopRollo
    Start-Sleep -Seconds 2
    # the old AppData home is retired once its supervisor is stopped
    if (Test-Path $OldHome) { Remove-Item $OldHome -Recurse -Force -ErrorAction SilentlyContinue }
    Start-ScheduledTask -TaskName $LogonTask
  } else {
    $running = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*solace-gpu.ps1*-Run*" }
    if (-not $running) { Start-Process -FilePath $lnk.TargetPath -ArgumentList $lnk.Arguments -WindowStyle Hidden | Out-Null }
  }
  Write-Output "Installed. Supervisor running; it starts hidden at every logon."
  Write-Output "Games list: $GamesFile"
  exit 0
}

if ($Uninstall) {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*solace-gpu.ps1*-Run*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  if (Test-Path $Shortcut) { Remove-Item $Shortcut -Force }
  Unregister-ScheduledTask -TaskName $BootTask -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $LogonTask -Confirm:$false -ErrorAction SilentlyContinue
  StopServer
  StopRollo
  Write-Output "Removed. Ollama stopped; Solace's NPCs now run on slopbot alone."
  exit 0
}

if ($Pause) {
  Set-Content -Path $PauseFlag -Value (Get-Date -Format o)
  StopServer
  StopRollo
  Log "paused by hand"
  Write-Output "Paused. The card is yours; until -Resume every character speaks scripted lines (there is no second engine)."
  exit 0
}

if ($Resume) {
  if (Test-Path $PauseFlag) { Remove-Item $PauseFlag -Force }
  Log "resumed by hand"
  Write-Output "Resumed. The engine comes back within a few seconds (unless a game is running)."
  exit 0
}

if ($ShowMode) {
  Set-Content -Path $ShowFlag -Value (Get-Date -Format o)
  Log "show mode on: games no longer pause the model"
  Write-Output "Show mode on. Launching a game no longer stops the model (War Thunder would now share the card with it). -Pause still works. Undo: -CasinoMode"
  exit 0
}

if ($CasinoMode) {
  if (Test-Path $ShowFlag) { Remove-Item $ShowFlag -Force }
  Log "show mode off: games pause the model again"
  Write-Output "Casino mode: the model steps aside for War Thunder, Star Citizen and games.txt again."
  exit 0
}

if ($VoicesElsewhere) {
  Set-Content -Path $VoicesOff -Value (Get-Date -Format o)
  Log "voices moved elsewhere"
  Write-Output "The regulars' voices won't run on this PC (the supervisor stops them within 5 seconds). Undo: -VoicesHere"
  exit 0
}

if ($VoicesHere) {
  if (Test-Path $VoicesOff) { Remove-Item $VoicesOff -Force }
  Log "voices back on this PC"
  Write-Output "The regulars' voices run on this PC again (within 5 seconds)."
  exit 0
}

if ($Status) {
  $sup = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*solace-gpu.ps1*-Run*" }
  Write-Output ("supervisor : " + ($(if ($sup) { "running" } else { "NOT running" })))
  $lt = Get-ScheduledTask -TaskName $LogonTask -ErrorAction SilentlyContinue
  Write-Output ("logon task : " + ($(if ($lt) { "registered ($($lt.State)) - at sign-in, re-checked every 5 min" } else { "NOT registered - re-run -Install" })))
  $bt = Get-ScheduledTask -TaskName $BootTask -ErrorAction SilentlyContinue
  Write-Output ("boot task  : " + ($(if ($bt) { "registered (starts at power-on)" } else { "not registered - logon only" })))
  Write-Output ("server     : " + ($(if (ServerUp) { "up" } else { "down" })))
  Write-Output ("rollo      : " + ($(if (Test-Path $VoicesOff) { "on slopbot (not this PC)" } elseif (-not (RolloWanted)) { "not set up" } elseif (RolloUp) { "up" } else { "down" })))
  Write-Output ("paused     : " + ($(if (Test-Path $PauseFlag) { "yes" } else { "no" })))
  Write-Output ("mode       : " + ($(if (Test-Path $ShowFlag) { "SHOW - games don't pause the model" } else { "casino - games pause the model" })))
  $g = RunningGame
  Write-Output ("game       : " + ($(if ($g) { $g } else { "none" })))
  try {
    $ps = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/ps" -TimeoutSec 3
    Write-Output ("loaded     : " + (($ps.models | ForEach-Object { $_.name }) -join ", "))
  } catch { Write-Output "loaded     : (server not answering)" }
  if (Test-Path $LogFile) { Write-Output ""; Get-Content $LogFile -Tail 8 }
  exit 0
}

if ($Run) {
  # ONE supervisor, however it was started: the boot task (no sign-in needed)
  # and the logon shortcut (the fallback) both land here, and the second one
  # simply leaves. Global\ so a boot-time copy in session 0 is seen too.
  $script:Mutex = New-Object System.Threading.Mutex($false, "Global\SolaceGpuSupervisor")
  try {
    if (-not $script:Mutex.WaitOne(0)) { exit 0 }
  } catch [System.Threading.AbandonedMutexException] {
    # a supervisor that crashed left it behind: it's ours now
  }
  Log "supervisor started"
  $lastState = ""
  while ($true) {
    try {
      $game = RunningGame
      $paused = Test-Path $PauseFlag
      $want = -not ($game -or $paused)
      $up = ServerUp
      $state = if ($game) { "game:$game" } elseif ($paused) { "paused" } else { "serving" }
      if ($want -and -not $up) {
        StartServer
        Log "started ollama serve"
      } elseif (-not $want -and $up) {
        StopServer
        Log "stopped ollama ($state)"
      }
      if (RolloWanted) {
        $rUp = RolloUp
        if ($want -and -not $rUp) {
          # A crash leaves its voice server behind; clear it before starting.
          StopRollo
          StartRollo
          Log "started rollo's voice"
        } elseif (-not $want -and $rUp) {
          StopRollo
          Log "stopped rollo's voice ($state)"
        }
      } elseif (RolloUp) {
        StopRollo
        Log "stopped rollo's voice (the voices run on slopbot now)"
      }
      if ($state -ne $lastState) { Log "state: $state"; $lastState = $state }
    } catch {
      Log ("error: " + $_.Exception.Message)
    }
    Start-Sleep -Seconds 5
  }
}

Write-Output "Usage: solace-gpu.ps1 -Install | -Status | -Pause | -Resume | -ShowMode | -CasinoMode | -VoicesElsewhere | -VoicesHere | -Uninstall"
