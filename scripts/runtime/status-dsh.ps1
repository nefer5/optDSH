$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$state = $null
try { $state = Get-Content (Join-Path $projectRoot '.runtime/dsh-host.json') -Raw | ConvertFrom-Json } catch { Write-Warning 'No readable DSH PID record.' }
$port = if ($state -and $state.port) { [int]$state.port } else { 3080 }
$process = if ($state) { Get-Process -Id $state.pid -ErrorAction SilentlyContinue } else { $null }
$owned = $false
try { $owned = $process -and ($process.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$state.startedUtc).UtcDateTime) -and (Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)").CommandLine.Contains((Join-Path $projectRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js')) } catch { }
$listenerIds = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($listenerId in $listenerIds) {
    $details = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerId"
    Write-Output "Port $port listener: PID $listenerId; executable $($details.ExecutablePath)"
}
$http = $null
$authState = 'Unavailable'
try {
    $launch = Get-Content (Join-Path $projectRoot '.runtime/web-launch.json') -Raw | ConvertFrom-Json
    $authUri = [uri]$launch.authenticatedUrl
    if (-not $owned -or $launch.pid -ne $state.pid -or $listenerIds -notcontains $state.pid -or $authUri.Scheme -ne 'http' -or $authUri.Host -ne '127.0.0.1' -or $authUri.Port -ne $port) { throw 'Stale record' }
    $http = (Invoke-WebRequest -Uri $authUri -TimeoutSec 3 -UseBasicParsing).StatusCode
    $authState = if ($http -eq 200) { 'Ready' } else { 'Failed' }
} catch { $authState = 'Stale or failed' }
[pscustomobject]@{ ProcessMatches=[bool]$owned; RecordedPID=$state.pid; ListenerPIDs=($listenerIds -join ','); URL="http://127.0.0.1:$port"; HTTP=$http; Authentication=$authState; ErrorLog=$state.stderr }
