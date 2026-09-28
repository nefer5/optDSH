[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
# Ensure the optical data service is running, without altering the active Zemax file.
$opticsState=Join-Path $root '.runtime/optics-process.json'
$opticsAlive=$false
if(Test-Path $opticsState){$o=Get-Content $opticsState -Raw|ConvertFrom-Json;$p=Get-Process -Id $o.pid -ErrorAction SilentlyContinue;$opticsAlive=$p -and $p.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$o.startedUtc).UtcDateTime}
if(-not $opticsAlive){& (Join-Path $PSScriptRoot 'start-optics.ps1')}
$hostPath=Join-Path $root '.runtime/dsh-host.json'
& (Join-Path $PSScriptRoot 'open-dsh.ps1') -NoBrowser
$state=Get-Content $hostPath -Raw|ConvertFrom-Json
$launch=Get-Content (Join-Path $root '.runtime/web-launch.json') -Raw | ConvertFrom-Json
if($launch.pid -ne $state.pid){throw 'Host launch state is stale.'}
if($NoBrowser){Write-Output "Workbench ready: $($state.url)/api/optdsh-workbench/view"}
else {Start-Process ($launch.authenticatedUrl+'#optdsh-workbench=1');Write-Output 'Opened official-host optical workbench.'}
