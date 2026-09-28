$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$state=Get-Content (Join-Path $root '.runtime/optics-process.json') -Raw | ConvertFrom-Json
$proc=Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if(-not $proc){Write-Output 'Optics bridge is stopped.'; return}
if($proc.StartTime.ToUniversalTime() -ne ([DateTimeOffset]$state.startedUtc).UtcDateTime){throw 'PID reused; no process stopped.'}
$cmd=(Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)").CommandLine
if(-not $cmd.Contains((Join-Path $root 'packages/optics/scripts/server.py'))){throw 'Process does not match this project.'}
$access=Get-Content (Join-Path $root '.runtime/optics-access.json') -Raw | ConvertFrom-Json
$view=Invoke-RestMethod "$($access.url)/api/snapshot" -Headers @{Authorization="Bearer $($access.token)"} -TimeoutSec 3
if($view.busy){throw 'Capture in progress; wait before stopping.'}
# Official DSH owns chats; retired headless endpoints return 410.
Stop-Process -Id $state.pid
Write-Output 'Optics bridge stopped; Zemax model and GUI untouched.'
