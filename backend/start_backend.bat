@echo off
title AutoTest AI — Backend
cd /d "%~dp0"

echo.
echo  AutoTest AI — Backend
echo  ─────────────────────────────────────────
echo  Directory : %CD%
echo  Provider  : %PROVIDER%
echo  Port      : 8000
echo  Docs      : http://localhost:8000/docs
echo  ─────────────────────────────────────────
echo.

if not exist venv\Scripts\uvicorn.exe (
    echo [ERROR] venv not found or uvicorn not installed.
    echo         Run: python -m venv venv ^&^& venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

if not exist .env (
    echo [WARN] .env file not found. Copying from .env.example ...
    copy .env.example .env
    echo [WARN] Edit .env and add your API keys before generating.
)

echo Starting uvicorn with --reload (auto-restarts on code changes)...
echo Press Ctrl+C to stop.
echo.

venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 8000 --reload
