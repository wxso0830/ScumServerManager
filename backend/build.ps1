# Build script for the LGSS backend standalone executable.
# Run this ONCE inside an activated venv to produce dist/lgss-backend.exe
#
# Usage (PowerShell, from backend/ folder):
#   .\build.ps1
#
# Output:
#   backend/dist/lgss-backend.exe   (single-file, ~90 MB)

param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "== LGSS Backend build ==" -ForegroundColor Cyan

# 1. Ensure venv is active
if (-not $env:VIRTUAL_ENV) {
    Write-Host "WARNING: no virtual env detected; activating .venv..." -ForegroundColor Yellow
    & .\.venv\Scripts\Activate.ps1
}

# 2. Install PyInstaller if missing
$pyi = & python -m pip show pyinstaller 2>$null
if (-not $pyi) {
    Write-Host "Installing PyInstaller..." -ForegroundColor Yellow
    python -m pip install pyinstaller
}

# 3. Clean old build
if ($Clean -and (Test-Path build)) { Remove-Item -Recurse -Force build }
if ($Clean -and (Test-Path dist))  { Remove-Item -Recurse -Force dist }

# 4. Build
Write-Host "Running PyInstaller... (this takes 3-5 minutes)" -ForegroundColor Cyan
python -m PyInstaller lgss-backend.spec --noconfirm --clean

if (Test-Path "dist\lgss-backend.exe") {
    $size = [math]::Round((Get-Item "dist\lgss-backend.exe").Length / 1MB, 1)
    Write-Host ""
    Write-Host "OK  built: dist\lgss-backend.exe  ($size MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test it:   dist\lgss-backend.exe" -ForegroundColor White
    Write-Host "Then open: http://127.0.0.1:8001/api/" -ForegroundColor White
} else {
    Write-Host "FAIL  dist\lgss-backend.exe missing" -ForegroundColor Red
    exit 1
}
