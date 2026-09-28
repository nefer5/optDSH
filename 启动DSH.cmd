@echo off

pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\runtime\open-dsh.ps1" %*

if errorlevel 1 pause
