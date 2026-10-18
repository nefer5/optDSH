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
        $development = Get-Content -LiteralPath $developmentPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($development.nodeExecutable) {
            if (-not [IO.Path]::IsPathRooted($development.nodeExecutable) -or -not (Test-Path -LiteralPath $development.nodeExecutable -PathType Leaf)) { throw 'Configured development Node executable is missing or not absolute.' }
            $env:PATH = (Split-Path $development.nodeExecutable -Parent) + ';' + $previousPath
        }
        if ($development.launchConfig -and -not $parameters.ContainsKey('Config') -and -not $parameters.ContainsKey('DshHome') -and -not $env:OPTDSH_HOME) {
            $localConfig = $development.launchConfig
            if (-not [IO.Path]::IsPathRooted($localConfig)) { $localConfig = Join-Path (Split-Path $developmentPath -Parent) $localConfig }
            $parameters.Config = [IO.Path]::GetFullPath($localConfig)
        }
    }
    & (Join-Path $PSScriptRoot 'start-dsh.ps1') @parameters
} finally { $env:PATH = $previousPath }
