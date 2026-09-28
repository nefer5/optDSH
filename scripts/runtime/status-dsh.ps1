$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$statePath = Join-Path $projectRoot '.runtime/dsh-host.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No managed DSH host recorded.'; return }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
$owned = $process -and ($process.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$state.startedUtc).UtcDateTime)
$http = $null
if ($owned) {
    try {
        $outputText = Get-Content -LiteralPath $state.stdout -Raw
        $urlMatch = [regex]::Match($outputText, 'dsh web: (http://127\.0\.0\.1:\d+/\?token=[^\s]+)')
        if ($urlMatch.Success) { $http = (Invoke-WebRequest -Uri $urlMatch.Groups[1].Value -TimeoutSec 3 -UseBasicParsing).StatusCode }
    } catch { }
}
[pscustomobject]@{ ProcessMatches = [bool]$owned; PID = $state.pid; URL = $state.url; HTTP = $http; ErrorLog = $state.stderr }
