$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$statePath = Join-Path $projectRoot '.runtime/dsh-host.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No managed DSH host recorded.'; return }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if (-not $process) { Write-Output 'Recorded DSH process has already exited.'; return }
if ($process.StartTime.ToUniversalTime() -ne ([DateTimeOffset]$state.startedUtc).UtcDateTime) { throw 'PID has been reused; refusing to stop an unrelated process.' }
$command = (Get-CimInstance Win32_Process -Filter "ProcessId = $($state.pid)").CommandLine
$expected = Join-Path $projectRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js'
if (-not $command -or -not $command.Contains($expected)) { throw 'Process command does not match this project DSH runtime.' }
# Windows process termination is not a guaranteed graceful DSH shutdown.
# Stop only after tasks/analyses have finished; keep all session files and logs.
Stop-Process -Id $state.pid -ErrorAction Stop
Wait-Process -Id $state.pid -Timeout 10 -ErrorAction SilentlyContinue
Write-Output 'Project DSH host stopped. Runtime data and logs retained.'
