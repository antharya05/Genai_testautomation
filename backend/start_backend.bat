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

rem --reload watches the whole backend\ tree, which also contains the venv and
rem runtime data dirs. Exclude them so source-only changes trigger a reload and
rem RAG/ChromaDB is not needlessly re-initialised (~2s each) on every restart.
rem NOTES on uvicorn's quirks (both verified):
rem  * RELATIVE exclude dir names are ignored — the path must be absolute.
rem  * Only DIRECTORY excludes are safe; an absolute file/glob pattern makes
rem    uvicorn call cwd.glob(<absolute>), which raises NotImplementedError.
rem %~dp0 expands to this script's dir (backend\) with a trailing backslash;
rem strip the trailing slash so the path is a clean directory.
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 8000 --reload ^
  --reload-exclude "%ROOT%\venv" ^
  --reload-exclude "%ROOT%\vectorstore_data" ^
  --reload-exclude "%ROOT%\uploads"
