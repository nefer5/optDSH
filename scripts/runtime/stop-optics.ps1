[CmdletBinding()]
param([Alias('Home')][string]$OptDshHome, [Alias('Profile')][string]$OptDshProfile, [string]$Workspace, [string]$StateRoot, [string]$Config)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'launch-config.ps1')
$ctx=Resolve-OptDshLaunch -Home $OptDshHome -Profile $OptDshProfile -Workspace $Workspace -StateRoot $StateRoot -Config $Config
$pidFile=Join-Path $ctx.RuntimeDir 'optics-process.json'
if(-not(Test-Path -LiteralPath $pidFile)){Write-Output 'No managed optics bridge recorded.';return}
$record=Get-Content -LiteralPath $pidFile -Raw|ConvertFrom-Json
if($record.schemaVersion -ne 1 -or $record.workspace -ne $ctx.Workspace -or $record.stateRoot -ne $ctx.StateRoot){throw 'Optics ownership record does not match selected workspace/state.'}
$proc=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
if(-not $proc){Write-Output 'Recorded optics bridge is stopped.';return}
if($proc.StartTime.ToUniversalTime() -ne ([DateTimeOffset]$record.startedUtc).UtcDateTime){throw 'PID reused; refusing this record.'}
$command=(Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)").CommandLine
if($command -notmatch '-m\s+optdsh_optics\s+serve' -or $command -notmatch [regex]::Escape($ctx.StateRoot) -or $command -notmatch [regex]::Escape($ctx.Workspace)){throw 'Optics process identity mismatch.'}
$access=Get-Content -LiteralPath (Join-Path $ctx.RuntimeDir 'optics-access.json') -Raw|ConvertFrom-Json
$uri=[uri]$access.url
if($access.pid -ne $record.pid -or $access.workspace -ne $ctx.Workspace -or $access.stateRoot -ne $ctx.StateRoot -or $uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or $uri.Port -ne $record.port -or $uri.UserInfo){throw 'Optics access ownership mismatch.'}
$view=Invoke-RestMethod "$($access.url)/api/snapshot" -Headers @{Authorization="Bearer $($access.token)"} -TimeoutSec 3
if($view.busy){throw 'Optical operation in progress; wait for its explicit completion before stopping.'}
Stop-Process -Id $record.pid
Write-Output 'Optics service stopped; Zemax GUI untouched.'
