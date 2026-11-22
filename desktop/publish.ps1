# Stage a desktop-shell release for solace.zone (Windows + optional macOS).
#
# Windows artifacts come from the local `npm run build`. macOS artifacts come
# from the GitHub Actions "desktop" workflow: download the shell-macos-latest
# artifact zip and unpack it into  desktop\ci-mac\  (any nesting is fine —
# the script globs). latest.json then carries every platform present, so
# installed shells on both OSes self-update from one manifest.

$ErrorActionPreference = "Stop"

$conf = Get-Content "$PSScriptRoot\src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$version = $conf.version
$bundle = "$PSScriptRoot\src-tauri\target\release\bundle\nsis"
$setup = Get-ChildItem $bundle -Filter "Solace_${version}_x64-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $setup) { throw "No Windows installer for version $version in $bundle - run npm run build first." }
$winSig = (Get-Content "$($setup.FullName).sig" -Raw).Trim()

$out = "$PSScriptRoot\dist-publish"
if (Test-Path $out) { Remove-Item "$out\*" -Recurse -Force }   # no stale versions
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item $setup.FullName "$out\$($setup.Name)" -Force
Copy-Item $setup.FullName "$out\Solace-Setup.exe" -Force   # stable download URL

# The public half of the self-signed publisher cert (optional install for
# friends who want the "Unknown publisher" UAC prompt to name Solace instead).
$cer = "$PSScriptRoot\Solace-Publisher.cer"
if (Test-Path $cer) { Copy-Item $cer "$out\Solace-Publisher.cer" -Force }

# Sanity: the staged installer must carry an Authenticode signature.
$sig = Get-AuthenticodeSignature "$out\Solace-Setup.exe"
if ($sig.Status -eq "NotSigned") { Write-Warning "Installer is NOT Authenticode-signed - did the signCommand run?" }
else { Write-Host "Authenticode: $($sig.SignerCertificate.Subject) [$($sig.Status)]" }

$platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
        signature = $winSig
        url       = "https://solace.zone/desktop/$($setup.Name)"
    }
}

# ---- macOS (optional): CI artifacts dropped in desktop\ci-mac\ ----
$mac = "$PSScriptRoot\ci-mac"
if (Test-Path $mac) {
    $dmg = Get-ChildItem $mac -Recurse -Filter "*.dmg" | Select-Object -First 1
    $tar = Get-ChildItem $mac -Recurse -Filter "*.app.tar.gz" | Select-Object -First 1
    $sig = Get-ChildItem $mac -Recurse -Filter "*.app.tar.gz.sig" | Select-Object -First 1
    # THE ARTIFACTS MUST BE THIS VERSION'S. They are RENAMED to the current
    # version below, so a stale ci-mac folder silently publishes an old build
    # under a new number — and a Mac would then download it, install it,
    # report the OLD version in its user-agent, see the new one offered again
    # and update forever without ever changing. Caught for real shipping
    # 0.3.6 with August's 0.3.5 artifacts still sitting in the folder.
    #
    # The dmg carries the version in its name (Solace_<version>_universal.dmg),
    # which is the only version stamp available here.
    $macVersion = if ($dmg -and $dmg.Name -match "_([\d.]+)_universal\.dmg$") { $Matches[1] } else { $null }
    if ($dmg -and $macVersion -ne $version) {
        Write-Warning "ci-mac holds version '$macVersion' but this release is $version - macOS SKIPPED."
        Write-Warning "  Re-run the GitHub Actions 'desktop' workflow, unpack its artifact into desktop\ci-mac\, and publish again."
        $dmg = $null
    }
    if ($dmg -and $tar -and $sig) {
        Copy-Item $dmg.FullName "$out\Solace_${version}_universal.dmg" -Force
        Copy-Item $dmg.FullName "$out\Solace.dmg" -Force              # stable URL
        Copy-Item $tar.FullName "$out\Solace_${version}_universal.app.tar.gz" -Force
        $macSig = (Get-Content $sig.FullName -Raw).Trim()
        $macUrl = "https://solace.zone/desktop/Solace_${version}_universal.app.tar.gz"
        # One universal build serves both architectures.
        $platforms["darwin-aarch64"] = [ordered]@{ signature = $macSig; url = $macUrl }
        $platforms["darwin-x86_64"] = [ordered]@{ signature = $macSig; url = $macUrl }
        Write-Host "macOS artifacts included."
    } else {
        Write-Warning "ci-mac exists but is missing dmg/app.tar.gz/sig - macOS SKIPPED."
    }
} else {
    Write-Host "(no desktop\ci-mac folder - Windows-only release)"
}

$manifest = [ordered]@{
    version   = $version
    pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = $platforms
}
# BOM-less UTF-8: the shell's updater JSON parser rejects a BOM outright
# (Windows PowerShell's -Encoding utf8 writes one).
[IO.File]::WriteAllText("$out\latest.json", ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Staged in $out :"
Get-ChildItem $out | ForEach-Object { Write-Host "  $($_.Name)  $([math]::Round($_.Length/1MB,1)) MB" }
Write-Host ""
Write-Host "Upload (root SSH is disabled by hardening - go in as your user, sudo up):"
Write-Host "  scp `"$out\*`" YOURUSER@YOUR_SERVER_IP:~"
Write-Host "  ssh YOURUSER@YOUR_SERVER_IP"
Write-Host "  # then on the server:"
Write-Host "  sudo mkdir -p /opt/solace/desktop-dist"
Write-Host "  sudo mv ~/latest.json ~/Solace-Setup.exe ~/Solace_*-setup.exe /opt/solace/desktop-dist/ 2>/dev/null"
Write-Host "  sudo mv ~/Solace.dmg ~/Solace_*_universal.* /opt/solace/desktop-dist/ 2>/dev/null"
Write-Host "  sudo chmod 755 /opt/solace/desktop-dist; sudo chmod 644 /opt/solace/desktop-dist/*"
