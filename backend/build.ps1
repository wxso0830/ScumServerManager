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

# Note: we do NOT set $ErrorActionPreference = "Stop" because
# Python 3.13 writes benign "Could not find platform independent
# libraries <prefix>" to stderr, which PowerShell would treat as fatal.

Write-Host "== LGSS Backend build ==" -ForegroundColor Cyan

# Always work inside backend/
Set-Location $PSScriptRoot

# 1. Ensure venv is active; if not, activate it
if (-not $env:VIRTUAL_ENV) {
    Write-Host "Activating .venv..." -ForegroundColor Yellow
    if (-not (Test-Path ".\.venv\Scripts\Activate.ps1")) {
        Write-Host "FAIL: .venv not found. Create it first:" -ForegroundColor Red
        Write-Host "  python -m venv .venv" -ForegroundColor White
        Write-Host "  .\.venv\Scripts\Activate.ps1" -ForegroundColor White
        Write-Host "  pip install -r requirements.txt" -ForegroundColor White
        exit 1
    }
    & .\.venv\Scripts\Activate.ps1
}

# 2. Install PyInstaller (idempotent - skips if already installed)
Write-Host "Ensuring PyInstaller is installed..." -ForegroundColor Yellow
python -m pip install --quiet --disable-pip-version-check pyinstaller 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: pip install pyinstaller failed" -ForegroundColor Red
    exit 1
}

# 3. Clean old build
if ($Clean) {
    if (Test-Path build) { Remove-Item -Recurse -Force build }
    if (Test-Path dist)  { Remove-Item -Recurse -Force dist }
}

# 4. Build
Write-Host "Running PyInstaller... (this takes 3-5 minutes)" -ForegroundColor Cyan
python -m PyInstaller lgss-backend.spec --noconfirm --clean 2>&1 | ForEach-Object {
    # Pipe output line-by-line so we see progress
    Write-Host $_
}

if (Test-Path "dist\lgss-backend.exe") {
    $size = [math]::Round((Get-Item "dist\lgss-backend.exe").Length / 1MB, 1)
    Write-Host ""
    Write-Host "OK  built: dist\lgss-backend.exe  ($size MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test it:   .\dist\lgss-backend.exe" -ForegroundColor White
    Write-Host "Then open: http://127.0.0.1:8001/api/" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "FAIL  dist\lgss-backend.exe not produced" -ForegroundColor Red
    exit 1
}
