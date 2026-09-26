$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$state=Get-Content (Join-Path $root '.runtime/optics-process.json') -Raw | ConvertFrom-Json
$proc=Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if(-not $proc){Write-Output 'Optics bridge is stopped.'; return}
if($proc.StartTime.ToUniversalTime() -ne ([DateTimeOffset]$state.startedUtc).UtcDateTime){throw 'PID reused; no process stopped.'}
$cmd=(Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)").CommandLine
if(-not $cmd.Contains((Join-Path $root 'scripts/optics-server.py'))){throw 'Process does not match this project.'}
$access=Get-Content (Join-Path $root '.runtime/optics-access.json') -Raw | ConvertFrom-Json
$view=Invoke-RestMethod "$($access.url)/api/snapshot" -Headers @{Authorization="Bearer $($access.token)"} -TimeoutSec 3
if($view.busy){throw 'Capture in progress; wait before stopping.'}
$jobs=Invoke-RestMethod "$($access.url)/api/agent/jobs" -Headers @{Authorization="Bearer $($access.token)"} -TimeoutSec 3
if($jobs.canvasBindings){foreach($binding in $jobs.canvasBindings.PSObject.Properties){if($binding.Value.active){Invoke-RestMethod "$($access.url)/api/canvas/disconnect" -Method Post -ContentType 'application/json' -Body (@{conversationId=$binding.Name}|ConvertTo-Json) -Headers @{Authorization="Bearer $($access.token)"} -TimeoutSec 10 | Out-Null}}}
foreach($job in $jobs.jobs | Where-Object status -eq 'running'){
    Invoke-RestMethod "$($access.url)/api/agent/cancel" -Method Post -ContentType 'application/json' -Body (@{id=$job.id}|ConvertTo-Json) -Headers @{Authorization="Bearer $($access.token)"} -TimeoutSec 10 | Out-Null
}
Stop-Process -Id $state.pid
Write-Output 'Optics bridge stopped; Zemax model and GUI untouched.'
