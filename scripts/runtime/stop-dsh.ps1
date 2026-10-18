[CmdletBinding()]
param([int]$Port, [Alias('Home')][string]$DshHome, [Alias('Profile')][string]$DshProfile, [string]$Workspace, [string]$StateRoot, [string[]]$Components, [string]$Config)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launch-config.ps1')
$context = Resolve-OptDshLaunch @PSBoundParameters
if (-not (Test-Path -LiteralPath $context.StatePath)) { Write-Output 'No managed DSH host recorded for this home/profile.'; return }
$lock = [IO.File]::Open((Join-Path $context.RuntimeDir 'launch.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
    $state = Get-Content -LiteralPath $context.StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not (Get-Process -Id $state.pid -ErrorAction SilentlyContinue)) { Write-Output 'Recorded host has already exited; data retained.'; return }
    if (-not (Test-OptDshOwner $context $state)) { throw 'Recorded process does not match this home/profile/workspace and start time. No process changed.' }
    # Windows termination is not guaranteed graceful; finish active work first.
    Stop-Process -Id $state.pid -ErrorAction Stop
    Wait-Process -Id $state.pid -Timeout 10 -ErrorAction SilentlyContinue
    Write-Output 'DSH host stopped. User home, workspace, logs and PID receipt retained.'
} finally { $lock.Dispose() }
