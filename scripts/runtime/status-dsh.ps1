[CmdletBinding()]
param([int]$Port, [Alias('Home')][string]$DshHome, [Alias('Profile')][string]$DshProfile, [string]$Workspace, [string]$StateRoot, [string[]]$Components, [string]$Config)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launch-config.ps1')
$context = Resolve-OptDshLaunch @PSBoundParameters
$state = $null
try { $state = Get-Content -LiteralPath $context.StatePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
$owned = Test-OptDshOwner $context $state
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $context.Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
$authentication = 'Unavailable'; $http = $null
if ($owned) { try { $null = Get-OptDshAuthUrl $context $state; $authentication = 'Ready'; $http = 200 } catch { $authentication = 'Stale or failed' } }
[pscustomobject]@{ Home=$context.Home; Profile=$context.Profile; Workspace=$context.Workspace; StateRoot=$context.StateRoot; ProcessMatches=[bool]$owned; RecordedPID=$state.pid; ListenerPIDs=($listeners -join ','); URL="http://127.0.0.1:$($context.Port)"; HTTP=$http; Authentication=$authentication; ErrorLog=$state.stderr }
