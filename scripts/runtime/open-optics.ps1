[CmdletBinding()]
param([Alias('Home')][string]$OptDshHome, [Alias('Profile')][string]$OptDshProfile, [string]$Workspace, [string]$StateRoot, [string]$Config, [string[]]$Components, [string]$OpticsConfig, [string]$Python, [switch]$NoBrowser)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'launch-config.ps1')
$ctx=Resolve-OptDshLaunch -Home $OptDshHome -Profile $OptDshProfile -Workspace $Workspace -StateRoot $StateRoot -Config $Config -Components $Components
$pidFile=Join-Path $ctx.RuntimeDir 'optics-process.json'
$alive=$false
if(Test-Path -LiteralPath $pidFile){$o=Get-Content -LiteralPath $pidFile -Raw|ConvertFrom-Json;$p=Get-Process -Id $o.pid -ErrorAction SilentlyContinue;$alive=$p -and $p.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$o.startedUtc).UtcDateTime}
if(-not $alive){& (Join-Path $PSScriptRoot 'start-optics.ps1') -Home $ctx.Home -Profile $ctx.Profile -Workspace $ctx.Workspace -StateRoot $ctx.StateRoot -OpticsConfig $OpticsConfig -Python $Python}
& (Join-Path $PSScriptRoot 'status-optics.ps1') -Home $ctx.Home -Profile $ctx.Profile -Workspace $ctx.Workspace -StateRoot $ctx.StateRoot | Out-Null
$workbenchComponents=@(@($ctx.Components)+@('core','workbench') | Select-Object -Unique)
& (Join-Path $PSScriptRoot 'open-dsh.ps1') -Home $ctx.Home -Profile $ctx.Profile -Workspace $ctx.Workspace -StateRoot $ctx.StateRoot -Components $workbenchComponents -NoBrowser
$state=Get-Content -LiteralPath $ctx.StatePath -Raw|ConvertFrom-Json
$launch=Get-Content -LiteralPath $ctx.LaunchPath -Raw|ConvertFrom-Json
if($launch.pid -ne $state.pid){throw 'Host launch state is stale.'}
Invoke-WebRequest -Uri $launch.authenticatedUrl -SessionVariable workbenchSession -UseBasicParsing -TimeoutSec 5 | Out-Null
$page=Invoke-WebRequest -Uri ($state.url.TrimEnd('/')+'/api/optdsh-workbench/view') -WebSession $workbenchSession -UseBasicParsing -TimeoutSec 5
if($page.StatusCode -ne 200 -or $page.Content -notmatch 'id="save-model"'){throw 'Workbench plugin is unavailable; platform may still be usable.'}
if($NoBrowser){Write-Output "Workbench ready: $($state.url)/api/optdsh-workbench/view"}
else{Start-Process ($launch.authenticatedUrl+'#optdsh-workbench=1');Write-Output 'Opened official-host optical workbench.'}
