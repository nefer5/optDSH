@echo off

pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\runtime\open-optics.ps1" %*

if errorlevel 1 pause
