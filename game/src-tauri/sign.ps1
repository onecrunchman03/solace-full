# Authenticode-signs one binary with the self-signed "CN=Solace" certificate.
# Invoked by Tauri's bundler (tauri.conf.json bundle.windows.signCommand) for
# the app exe AND the NSIS installer, BEFORE the updater's minisign signature
# is generated - so the .sig always covers the signed bytes.
#
# The private key lives only in this machine's CurrentUser cert store (backup:
# ~/.tauri/solace-codesign.pfx + .pass). Missing cert = hard fail; a silently
# unsigned release would defeat the point.
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = "Stop"

$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -eq "CN=Solace" -and $_.HasPrivateKey } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) { throw "No CN=Solace code-signing cert in CurrentUser\My. Restore it: Import-PfxCertificate ~/.tauri/solace-codesign.pfx (password in solace-codesign.pass)." }

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\" } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw "signtool.exe not found (Windows 10/11 SDK required)." }

& $signtool.FullName sign /sha1 $cert.Thumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "$File"
if ($LASTEXITCODE -ne 0) { throw "signtool failed on $File (exit $LASTEXITCODE)" }
