# SOLACE SURVIVORZ - the stream rig's keeper loop (run BY the scheduled task, see stream-task.ps1).
#
# Runs scripts\survivorz\streamer.mjs until it exits, waits 15 s, and runs it again - forever, until
# the stop flag exists (stream-task.ps1 -Stop writes it). A crash, an ffmpeg that won't start, a dead
# Edge: the streamer handles what it can itself, and this loop handles the streamer.
# One log per day in the rig's log folder.
$ErrorActionPreference = "Continue"
$Repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$LogDir = Join-Path $Repo "assets\downloads\survivorz\stream"
$StopFlag = Join-Path $env:USERPROFILE ".solace-survivorz-stream.stop"
New-Item -ItemType Directory -Force $LogDir | Out-Null
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }

# ffmpeg is a per-user WinGet install: make sure the task's PATH has it
$ff = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ff -and -not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { $env:PATH = "$($ff.DirectoryName);$env:PATH" }

Set-Location $Repo
while (-not (Test-Path $StopFlag)) {
  $log = Join-Path $LogDir ("rig-" + (Get-Date -Format "yyyyMMdd") + ".out.txt")
  Add-Content -Path $log -Value ("==== " + (Get-Date -Format "s") + " starting the streamer") -Encoding ascii
  # cmd /c so the streamer's UTF-8 lands in the file as bytes (PowerShell 5.1's redirection writes UTF-16)
  & cmd.exe /c "`"$node`" scripts\survivorz\streamer.mjs 0 >> `"$log`" 2>&1"
  Add-Content -Path $log -Value ("==== " + (Get-Date -Format "s") + " the streamer exited ($LASTEXITCODE)") -Encoding ascii
  if (Test-Path $StopFlag) { break }
  Start-Sleep -Seconds 15
}
