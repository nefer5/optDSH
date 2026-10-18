@echo off
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\runtime\open-dsh.ps1" -Restart %*
set "launchCode=%errorlevel%"
if not "%launchCode%"=="0" pause
exit /b %launchCode%
