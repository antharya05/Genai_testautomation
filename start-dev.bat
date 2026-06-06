@echo off
title AutoTest AI — Dev Environment
cd /d "%~dp0"

echo.
echo  AutoTest AI — Development Environment
echo  ─────────────────────────────────────────────────────────
echo  Backend   : http://localhost:8000
echo  Frontend  : http://localhost:5173
echo  API Docs  : http://localhost:8000/docs
echo  ─────────────────────────────────────────────────────────
echo  Both servers run in separate windows.
echo  Close this window once both are started.
echo  ─────────────────────────────────────────────────────────
echo.

echo [1/2] Starting backend (port 8000)...
start "AutoTest AI — Backend" cmd /k "cd /d %~dp0backend && start_backend.bat"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend (port 5173)...
start "AutoTest AI — Frontend" cmd /k "cd /d %~dp0frontend && start_frontend.bat"

echo.
echo  Both servers are starting in separate windows.
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo.
echo  This window can be closed.
pause
