# Start Rollo's voice agent (see README.md beside this file).
$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repo
& "D:\solace-ai\rollo-venv\Scripts\python.exe" "scripts\rollo\agent.py"
