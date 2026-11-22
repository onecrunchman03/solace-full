# SolaceBackrooms publisher — build the installer and stage it for the server.
#
#   cd game; powershell -ExecutionPolicy Bypass -File publish.ps1
#
# Output lands in game/dist-publish/SolaceBackrooms-Setup.exe. Upload it to
# the R220's /opt/solace/desktop-dist/ (the dir Caddy already serves at
# /desktop/*) — the GET THE GAME card in Solace's Backrooms section detects
# the file and shows the download button automatically. No latest.json /
# updater manifest: the game has no self-updater (v1); new versions ship by
# replacing this file, and players re-download.

$ErrorActionPreference = "Stop"
$env:Path = "C:\Users\you\.cargo\bin;$env:Path"

Write-Host "== building SolaceBackrooms (vite + tauri) =="
npx tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

$bundle = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Select-Object -First 1
if (-not $bundle) { throw "no NSIS installer found under src-tauri\target\release\bundle\nsis" }

New-Item -ItemType Directory -Force "dist-publish" | Out-Null
Copy-Item $bundle.FullName "dist-publish\SolaceBackrooms-Setup.exe" -Force
$mb = [math]::Round((Get-Item "dist-publish\SolaceBackrooms-Setup.exe").Length / 1MB, 1)

Write-Host ""
Write-Host "== staged: dist-publish\SolaceBackrooms-Setup.exe ($mb MB) =="
Write-Host "Upload to the server (from this directory):"
Write-Host "  scp dist-publish/SolaceBackrooms-Setup.exe you@YOUR_SERVER_IP:/tmp/"
Write-Host "then on the server:"
Write-Host "  sudo mv /tmp/SolaceBackrooms-Setup.exe /opt/solace/desktop-dist/"
Write-Host "  sudo chmod o+r /opt/solace/desktop-dist/SolaceBackrooms-Setup.exe"
