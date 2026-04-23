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

# 2b. ALWAYS sync runtime dependencies before building.
# Rationale: if requirements.txt gained a new package (e.g. discord.py)
# but the user's .venv is stale, PyInstaller silently produces an exe
# that is missing that module and crashes at runtime with
# "ModuleNotFoundError: No module named 'discord'".
#
# NOTE: we do NOT abort the build on pip errors here. requirements.txt
# may contain pod-only packages that are not on public PyPI (shipped by
# the dev environment only). The critical-module sanity check below is
# the source of truth for whether the build can proceed.
Write-Host "Syncing runtime dependencies from requirements.txt..." -ForegroundColor Yellow
python -m pip install --disable-pip-version-check -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARN: 'pip install -r requirements.txt' reported errors (likely pod-only packages)." -ForegroundColor Yellow
    Write-Host "      Continuing - the sanity check below will fail loudly if a module the exe needs is missing." -ForegroundColor Yellow
}

# 2c. Sanity-check: every module the spec marks as a hidden import
# must actually be importable in this venv, otherwise the produced
# exe will crash on first launch.
Write-Host "Verifying critical modules are importable..." -ForegroundColor Yellow
$critical = @('discord', 'discord.ext.commands', 'fastapi', 'uvicorn', 'motor', 'pymongo', 'aiohttp')
foreach ($mod in $critical) {
    python -c "import $mod" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL: Python cannot import '$mod'. Install it into this venv before building." -ForegroundColor Red
        Write-Host "      python -m pip install -r requirements.txt" -ForegroundColor White
        exit 1
    }
}
Write-Host "OK  all critical modules importable" -ForegroundColor Green

# 3. Clean old build
# Always clean so a stale build/ cache can never bake in old bytecode
# that references a module which is no longer present.
if (Test-Path build) { Remove-Item -Recurse -Force build }
if (Test-Path dist)  { Remove-Item -Recurse -Force dist }

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
