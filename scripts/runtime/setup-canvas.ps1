[CmdletBinding()]
param([Alias('Home')][Parameter(Mandatory)][string]$DshHome,[string]$CanvasRoot,[string]$Package,[string]$InstallRoot,[int]$Port=4173,[switch]$NoAutoStart,[switch]$Start)
$ErrorActionPreference='Stop'
$productRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$cli=Join-Path $productRoot 'packages/optdsh-bundle/lib/canvas-cli.mjs'
if(-not(Test-Path -LiteralPath $cli)){$cli=Join-Path $productRoot 'node_modules/optdsh-bundle/lib/canvas-cli.mjs'}
$arguments=@($(if($Package){'install'}else{'connect'}),'--home',$DshHome,'--port',"$Port")
if($Package){if(-not $InstallRoot){throw 'Select a new independent Canvas InstallRoot'};$arguments+=@('--tarball',$Package,'--install-root',$InstallRoot)}
elseif($CanvasRoot){$arguments+=@('--root',$CanvasRoot)}
if($NoAutoStart){$arguments+='--no-auto-start'}
& node $cli @arguments
if($LASTEXITCODE){throw 'Canvas setup failed; existing installation and project data were preserved.'}
if($Start){& node $cli ensure --home $DshHome;if($LASTEXITCODE){throw 'Canvas was configured but failed runtime readiness; inspect its diagnostics.'}}
