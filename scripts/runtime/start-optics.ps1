[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 3081, [switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$configFile = Join-Path $projectRoot 'config/optics.local.json'
if (-not (Test-Path -LiteralPath $configFile)) { throw 'Create config/optics.local.json from optics.example.json first.' }
$config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if(-not [IO.Path]::IsPathRooted($config.python)){$config.python=Join-Path $projectRoot $config.python}
if (-not (Test-Path -LiteralPath $config.python)) { throw 'Configured Python interpreter is missing.' }
$runtimeDir = Join-Path $projectRoot '.runtime'
$logs = Join-Path $projectRoot 'logs/optics'
New-Item -ItemType Directory -Path $runtimeDir,$logs -Force | Out-Null
$pidFile = Join-Path $runtimeDir 'optics-process.json'
if (Test-Path -LiteralPath $pidFile) {
    $old = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $proc = Get-Process -Id $old.pid -ErrorAction SilentlyContinue
    if ($proc -and $proc.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$old.startedUtc).UtcDateTime) { throw 'This project optics bridge is already running.' }
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw "Port $Port is occupied." }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$entry = Join-Path $projectRoot 'packages/optics/scripts/server.py'
$child = Start-Process -FilePath $config.python -ArgumentList @('-X','utf8',('"'+$entry+'"'),'--config',('"'+$configFile+'"'),'--port',"$Port") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$stamp.stdout.log") -RedirectStandardError (Join-Path $logs "$stamp.stderr.log") -PassThru
[IO.File]::WriteAllText($pidFile, (@{pid=$child.Id;startedUtc=$child.StartTime.ToUniversalTime().ToString('o');entry=$entry} | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$ready=$false
for($i=0;$i -lt 40;$i++) {
    $child.Refresh(); if($child.HasExited){throw "Optics bridge exited; inspect $logs"}
    try {
        $state=Get-Content (Join-Path $runtimeDir 'optics-access.json') -Raw | ConvertFrom-Json
        $result=Invoke-RestMethod "$($state.url)/api/snapshot" -Headers @{Authorization="Bearer $($state.token)"} -TimeoutSec 2
        $ready=$true; break
    } catch { Start-Sleep -Milliseconds 500 }
}
if(-not $ready){throw "Startup not ready; inspect $logs"}
Write-Output "Optics bridge: $($state.url), backend=$($result.backend), explicit-save enabled"
if($result.error){Write-Output "Capture pending: $($result.error.code). Open UI to inspect/retry."}
if($OpenBrowser){& (Join-Path $PSScriptRoot 'open-optics.ps1')}
