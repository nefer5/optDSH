[CmdletBinding()]
param([int]$Port, [Alias('Home')][string]$DshHome, [Alias('Profile')][string]$DshProfile, [string]$Workspace, [string]$StateRoot, [string[]]$Components, [string]$Config, [switch]$NoBrowser, [switch]$Restart)
$ErrorActionPreference = 'Stop'
$parameters = @{} + $PSBoundParameters
$parameters.Remove('NoBrowser') | Out-Null
$parameters.OpenBrowser = -not $NoBrowser
& (Join-Path $PSScriptRoot 'start-dsh.ps1') @parameters
