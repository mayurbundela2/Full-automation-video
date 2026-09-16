@echo off
title Stop Gemini TTS Studio
cd /d "%~dp0"

echo ==================================================
echo    Stopping Gemini TTS Studio & Freeing Port 8000
echo ==================================================
echo.

:: 1. Send graceful shutdown request to the API
echo [1/2] Sending graceful shutdown request to API...
powershell -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/shutdown' -Method Post -TimeoutSec 2 | Out-Null } catch {}" >nul 2>&1

:: 2. Find any process still holding port 8000 and kill it
echo [2/2] Checking if port 8000 is occupied...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Stopping process PID %%a on port 8000...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ==================================================
echo  Gemini TTS Studio is stopped. Port 8000 is free!
echo ==================================================
timeout /t 3
