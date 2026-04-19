# Downloads dependencies that need to be bundled into the installer:
#   1. MongoDB 4.4 portable (NO AVX requirement -> works on Windows Server 2019
#      and any CPU from 2011+).
#   2. Visual C++ Redistributable 2015-2022 (x64) -> NSIS custom installer
#      auto-runs this silently so end users don't have to install anything.
#
# Run this ONCE before `npm run dist` (or when you want to refresh bundled
# dependencies). Idempotent: skips files that already exist and are valid.
#
# Usage (PowerShell, from the electron/ folder OR project root):
#   .\prepare-bundle.ps1

$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
$mongoDir = Join-Path $root "mongodb-portable"
$mongoBin = Join-Path $mongoDir "bin"
$mongodExe = Join-Path $mongoBin "mongod.exe"
$vcDir = Join-Path $root "electron\installer"
$vcExe = Join-Path $vcDir "vc_redist.x64.exe"

Write-Host "== LGSS Manager - preparing bundled dependencies ==" -ForegroundColor Cyan
Write-Host "Project root: $root" -ForegroundColor DarkGray

# --- 1. MongoDB 4.4 portable -------------------------------------------------
if (Test-Path $mongodExe) {
    $size = (Get-Item $mongodExe).Length
    if ($size -gt 20MB) {
        Write-Host "[OK] mongod.exe already present ($([math]::Round($size/1MB,1)) MB)" -ForegroundColor Green
    } else {
        Remove-Item -Force $mongodExe
    }
}

if (-not (Test-Path $mongodExe)) {
    $mongoUrl = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-4.4.29.zip"
    $mongoZip = Join-Path $env:TEMP "mongodb-4.4.29.zip"
    $mongoTmp = Join-Path $env:TEMP "mongodb-4.4.29-extract"

    Write-Host "Downloading MongoDB 4.4.29 (no AVX required, ~280 MB)..." -ForegroundColor Yellow
    Write-Host "  from $mongoUrl" -ForegroundColor DarkGray
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $mongoUrl -OutFile $mongoZip -UseBasicParsing

    Write-Host "Extracting mongod.exe only..." -ForegroundColor Yellow
    if (Test-Path $mongoTmp) { Remove-Item -Recurse -Force $mongoTmp }
    Expand-Archive -Path $mongoZip -DestinationPath $mongoTmp -Force

    $extracted = Get-ChildItem -Path $mongoTmp -Recurse -Filter mongod.exe |
                 Select-Object -First 1
    if (-not $extracted) {
        throw "mongod.exe not found inside downloaded MongoDB ZIP"
    }

    New-Item -Force -ItemType Directory -Path $mongoBin | Out-Null
    Copy-Item -Force $extracted.FullName $mongodExe

    Remove-Item -Recurse -Force $mongoTmp
    Remove-Item -Force $mongoZip

    $size = (Get-Item $mongodExe).Length
    Write-Host "[OK] mongod.exe placed -> $mongodExe ($([math]::Round($size/1MB,1)) MB)" -ForegroundColor Green
}

# --- 2. Visual C++ Redistributable 2015-2022 (x64) ---------------------------
if (Test-Path $vcExe) {
    $size = (Get-Item $vcExe).Length
    if ($size -gt 15MB) {
        Write-Host "[OK] vc_redist.x64.exe already present ($([math]::Round($size/1MB,1)) MB)" -ForegroundColor Green
    } else {
        Remove-Item -Force $vcExe
    }
}

if (-not (Test-Path $vcExe)) {
    $vcUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    Write-Host "Downloading Visual C++ Redistributable 2015-2022 (x64)..." -ForegroundColor Yellow
    Write-Host "  from $vcUrl" -ForegroundColor DarkGray

    New-Item -Force -ItemType Directory -Path $vcDir | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $vcUrl -OutFile $vcExe -UseBasicParsing

    $size = (Get-Item $vcExe).Length
    Write-Host "[OK] vc_redist.x64.exe placed -> $vcExe ($([math]::Round($size/1MB,1)) MB)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Hazir! Simdi su komutu calistirabilirsin:" -ForegroundColor Cyan
Write-Host "  cd electron" -ForegroundColor White
Write-Host "  npm run dist" -ForegroundColor White
Write-Host ""
