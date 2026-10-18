[CmdletBinding()]
param([Alias('Home')][string]$OptDshHome, [Alias('Profile')][string]$OptDshProfile, [string]$Workspace, [string]$StateRoot, [string]$Config, [string[]]$Components, [int]$Port, [string]$OpticsConfig, [string]$Python, [switch]$StartOptics, [switch]$NoBrowser)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'launch-config.ps1')
$productRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$developmentPath=Join-Path $productRoot '.runtime/development.json'
$node=(Get-Command node.exe -ErrorAction Stop).Source
if(Test-Path -LiteralPath $developmentPath){
 $development=Get-Content -LiteralPath $developmentPath -Raw -Encoding UTF8|ConvertFrom-Json
 if($development.nodeExecutable){$node=$development.nodeExecutable}
 if($development.launchConfig -and -not $Config -and -not $OptDshHome -and -not $env:OPTDSH_HOME){
  $Config=$development.launchConfig
  if(-not [IO.Path]::IsPathRooted($Config)){$Config=Join-Path (Split-Path $developmentPath -Parent) $Config}
 }
}
$ctx=Resolve-OptDshLaunch -Home $OptDshHome -Profile $OptDshProfile -Workspace $Workspace -StateRoot $StateRoot -Config $Config -Components $Components -Port $Port
# Open the base platform without changing recommended components or plugin state.
$verifiedHost=$false
if(Test-Path -LiteralPath $ctx.StatePath){
 try{$existingHost=Get-Content -LiteralPath $ctx.StatePath -Raw|ConvertFrom-Json;if(Test-OptDshOwner $ctx $existingHost){$null=Get-OptDshAuthUrl $ctx $existingHost;$verifiedHost=$true}}catch{}
}
if(-not $verifiedHost){& (Join-Path $PSScriptRoot 'open-dsh.ps1') -Home $ctx.Home -Profile $ctx.Profile -Workspace $ctx.Workspace -StateRoot $ctx.StateRoot -Port $ctx.Port -Components $ctx.Components -NoBrowser}
$bundleCli=Join-Path $ctx.InstallRoot 'packages/optdsh-bundle/lib/cli.mjs'
if(-not(Test-Path -LiteralPath $bundleCli)){$bundleCli=Join-Path $ctx.InstallRoot 'node_modules/optdsh-bundle/lib/cli.mjs'}
$workbench=& $node $bundleCli profile-component-state --component workbench --install-root $ctx.InstallRoot --home $ctx.Home --profile $ctx.Profile|ConvertFrom-Json
if(-not $workbench.enabled){throw ('Workbench is '+$workbench.status+'. Base DSH is running; use its official plugin manager to install or enable the workbench. No plugin was reinstalled or enabled.')}
# The UI plugin never implies permission to start a solver or connect Zemax.
if($StartOptics){
 $pidFile=Join-Path $ctx.RuntimeDir 'optics-process.json';$alive=$false
 if(Test-Path -LiteralPath $pidFile){$o=Get-Content -LiteralPath $pidFile -Raw|ConvertFrom-Json;$p=Get-Process -Id $o.pid -ErrorAction SilentlyContinue;$alive=$p -and $p.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$o.startedUtc).UtcDateTime}
 if(-not $alive){& (Join-Path $PSScriptRoot 'start-optics.ps1') -Home $ctx.Home -Profile $ctx.Profile -Workspace $ctx.Workspace -StateRoot $ctx.StateRoot -OpticsConfig $OpticsConfig -Python $Python}
}
$state=Get-Content -LiteralPath $ctx.StatePath -Raw|ConvertFrom-Json
$launch=Get-Content -LiteralPath $ctx.LaunchPath -Raw|ConvertFrom-Json
if($launch.pid -ne $state.pid){throw 'Host launch state is stale.'}
Invoke-WebRequest -Uri $launch.authenticatedUrl -SessionVariable workbenchSession -UseBasicParsing -TimeoutSec 5|Out-Null
$page=Invoke-WebRequest -Uri ($state.url.TrimEnd('/')+'/api/optdsh-workbench/view') -WebSession $workbenchSession -UseBasicParsing -TimeoutSec 5
if($page.StatusCode -ne 200 -or $page.Content -notmatch 'id="save-model"'){throw 'Workbench plugin is unavailable; the base platform remains running.'}
if($NoBrowser){Write-Output "Workbench ready: $($state.url)/api/optdsh-workbench/view (optics is independently managed)"}
else{Start-Process ($launch.authenticatedUrl+'#optdsh-workbench=1');Write-Output 'Opened official-host optical workbench.'}
