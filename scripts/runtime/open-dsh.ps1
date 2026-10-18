[CmdletBinding()]
param([int]$Port, [Alias('Home')][string]$DshHome, [Alias('Profile')][string]$DshProfile, [string]$Workspace, [string]$StateRoot, [string[]]$Components, [string]$Config, [switch]$NoBrowser, [switch]$Restart)
$ErrorActionPreference = 'Stop'
$parameters = @{} + $PSBoundParameters
$parameters.Remove('NoBrowser') | Out-Null
$parameters.OpenBrowser = -not $NoBrowser
# Optional, ignored developer-machine settings; never shipped in release packages.
$developmentPath = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '.runtime/development.json'
$previousPath = $env:PATH
try {
    if (Test-Path -LiteralPath $developmentPath -PathType Leaf) {
        $development = Get-Content -LiteralPath $developmentPath -Raw | ConvertFrom-Json
        if ($development.nodeExecutable) {
            if (-not [IO.Path]::IsPathFullyQualified($development.nodeExecutable) -or -not (Test-Path -LiteralPath $development.nodeExecutable -PathType Leaf)) { throw 'Configured development Node executable is missing or not absolute.' }
            $env:PATH = (Split-Path $development.nodeExecutable -Parent) + ';' + $previousPath
        }
        if ($development.launchConfig -and -not $parameters.ContainsKey('Config') -and -not $parameters.ContainsKey('DshHome') -and -not $env:OPTDSH_HOME) {
            $parameters.Config = [IO.Path]::GetFullPath($development.launchConfig, (Split-Path $developmentPath -Parent))
        }
    }
    & (Join-Path $PSScriptRoot 'start-dsh.ps1') @parameters
} finally { $env:PATH = $previousPath }
