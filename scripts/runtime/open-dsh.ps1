[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$statePath = Join-Path $projectRoot '.runtime/dsh-host.json'
$state = $null
if (Test-Path -LiteralPath $statePath) { $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
$process = if ($state) { Get-Process -Id $state.pid -ErrorAction SilentlyContinue } else { $null }
if (-not $process -or $process.StartTime.ToUniversalTime() -ne ([DateTimeOffset]$state.startedUtc).UtcDateTime) {
    $port = if ($state -and $state.port) { [int]$state.port } else { 3080 }
    & (Join-Path $PSScriptRoot 'start-dsh.ps1') -Port $port
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
}
$launch=Get-Content (Join-Path $projectRoot '.runtime/web-launch.json') -Raw | ConvertFrom-Json
if($launch.pid -ne $state.pid){throw 'Host launch state is stale; restart the project host.'}
$response = Invoke-WebRequest -Uri $launch.authenticatedUrl -TimeoutSec 5 -UseBasicParsing
if ($response.StatusCode -ne 200) { throw 'DSH authentication check failed.' }
if (-not $NoBrowser) {
    Start-Process $launch.authenticatedUrl
    Write-Output 'Opened project DSH Web in the default browser.'
} else { Write-Output "DSH Web ready: $($state.url) (authenticated HTTP 200)" }
