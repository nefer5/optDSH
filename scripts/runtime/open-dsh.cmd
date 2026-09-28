@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-dsh.ps1"
if errorlevel 1 (
  echo DSH failed to open. See the error above.
  pause
  exit /b 1
)
