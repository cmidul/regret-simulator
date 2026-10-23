@echo off
title Regret Simulator - stop
echo.
echo  Stopping Regret Simulator...
echo.

REM === 1. The tunnel. This is what ACTUALLY takes the site offline. ===
REM Without this the app keeps running locally, but nobody outside your
REM machine can reach it.
set FOUND=
taskkill /IM cloudflared.exe /F >nul 2>&1 && set FOUND=1
if defined FOUND (
    echo   [tunnel]   stopped - public link is now DEAD
) else (
    echo   [tunnel]   was not running
)

REM === 2. The app on port 3001 ===
set FOUND=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /PID %%p /F >nul 2>&1
    set FOUND=1
)
if defined FOUND (
    echo   [app]      stopped - localhost:3001 is down
) else (
    echo   [app]      was not running
)

REM === 3. The Vite dev server on port 5173 (only running in dev) ===
set FOUND=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /PID %%p /F >nul 2>&1
    set FOUND=1
)
if defined FOUND (
    echo   [dev]      stopped - localhost:5173 is down
) else (
    echo   [dev]      was not running
)

echo.
echo  Ollama is a Windows service and is probably still running.
echo  It holds your model in RAM - roughly 4GB for a 4B model.
echo.
choice /C YN /N /M "  Stop Ollama too and free that RAM? [Y/N] "
if errorlevel 2 (
    echo.
    echo   [ollama]   left running - next start will be instant
) else (
    taskkill /IM ollama.exe /F >nul 2>&1
    echo.
    echo   [ollama]   stopped - RAM freed. Next start re-loads the model.
)

echo.
echo  Done. To bring it all back, double-click share.cmd.
echo.
pause
