@echo off
title Regret Simulator - share launcher
cd /d "%~dp0"

echo.
echo  [1/3] Ollama...
curl -fsS http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo        not running - starting it now.
    start "Ollama" /min cmd /c "ollama serve"
    timeout /t 6 /nobreak >nul
) else (
    echo        already running.
)

echo  [2/3] Building the UI (first run only, ~5s)...
call npm run build >nul 2>&1
if errorlevel 1 (
    echo        BUILD FAILED - run "npm run build" in this folder to see why.
    pause
    exit /b 1
)

echo  [3/3] Starting the app and the public tunnel...
start "Regret Simulator - app (keep open)" /min cmd /c "set NODE_ENV=production&& set TRUST_PROXY=1&& set RATE_MAX=10&& node server/index.js"
timeout /t 3 /nobreak >nul

start "Regret Simulator - SHARE URL (keep open)" cmd /c ""%ProgramFiles(x86)%\cloudflared\cloudflared.exe" tunnel --url http://localhost:3001"

echo.
echo  ------------------------------------------------------------------
echo   Three windows have opened. KEEP ALL THREE OPEN to stay online:
echo     - Ollama            (the model)
echo     - app               (the server, minimised)
echo     - SHARE URL         (copy the https://...trycloudflare.com link)
echo.
echo   Copy the trycloudflare.com link from the last window and share it.
echo.
echo   Every time you restart this script you get a NEW link, because
echo   quick tunnels are temporary. Closing your laptop also takes it down.
echo  ------------------------------------------------------------------
echo.
pause
