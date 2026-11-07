@echo off
title Sentinel-AI server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  1. Go to https://nodejs.org and download the "LTS" version
  echo  2. Install it ^(Next, Next, Finish^)
  echo  3. Double-click start.bat again
  echo.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)
rem Open in Microsoft Edge (installed on every Windows 10/11 PC). To use another browser, open http://localhost:8787 yourself.
start "" cmd /c "timeout /t 2 >nul & start msedge http://localhost:8787"
node server\server.js
pause
