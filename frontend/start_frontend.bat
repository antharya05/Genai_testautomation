@echo off
title AutoTest AI — Frontend
cd /d "%~dp0"

echo.
echo  AutoTest AI — Frontend
echo  ─────────────────────────────────────────
echo  Directory : %CD%
echo  URL       : http://localhost:5173
echo  API       : http://localhost:8000  (backend must be running)
echo  ─────────────────────────────────────────
echo.

if not exist node_modules (
    echo [INFO] node_modules not found. Installing dependencies...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo Starting Vite dev server...
echo Press Ctrl+C to stop.
echo.

npm run dev
