[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$hostPath=Join-Path $root '.runtime/dsh-host.json'
& (Join-Path $PSScriptRoot 'open-dsh.ps1') -NoBrowser
$state=Get-Content $hostPath -Raw|ConvertFrom-Json
$log=Get-Content -LiteralPath $state.stdout -Raw
$match=[regex]::Match($log,'dsh web: (http://127\.0\.0\.1:\d+/\?token=[^\s]+)')
if(-not $match.Success){throw 'DSH authentication URL missing; run start-dsh.ps1 first.'}
if($NoBrowser){Write-Output "Workbench ready: $($state.url)/api/optdsh-workbench/view"}
else {Start-Process ($match.Groups[1].Value+'#optdsh-workbench=1');Write-Output 'Opened official-host optical workbench.'}
