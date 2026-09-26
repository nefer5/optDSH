[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$statePath = Join-Path $projectRoot '.runtime/dsh-host.json'
$state = $null
if (Test-Path -LiteralPath $statePath) { $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
$process = if ($state) { Get-Process -Id $state.pid -ErrorAction SilentlyContinue } else { $null }
if (-not $process -or $process.StartTime.ToUniversalTime() -ne ([DateTimeOffset]$state.startedUtc).UtcDateTime) {
    $port = if ($state -and $state.port) { [int]$state.port } else { 3080 }
    & (Join-Path $PSScriptRoot 'start-dsh.ps1') -Port $port
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
}
$outputText = Get-Content -LiteralPath $state.stdout -Raw
$urlMatch = [regex]::Match($outputText, 'dsh web: (http://127\.0\.0\.1:\d+/\?token=[^\s]+)')
if (-not $urlMatch.Success) { throw 'Authenticated launch URL is not ready; inspect host status.' }
# The local access token stays in ignored runtime logs, never printed here.
$response = Invoke-WebRequest -Uri $urlMatch.Groups[1].Value -TimeoutSec 5 -UseBasicParsing
if ($response.StatusCode -ne 200) { throw 'DSH authentication check failed.' }
if (-not $NoBrowser) {
    Start-Process $urlMatch.Groups[1].Value
    Write-Output 'Opened project DSH Web in the default browser.'
} else { Write-Output "DSH Web ready: $($state.url) (authenticated HTTP 200)" }
