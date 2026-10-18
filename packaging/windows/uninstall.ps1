[CmdletBinding()]
param([Parameter(Mandatory)][string]$InstallRoot,[switch]$Apply)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\','/')
if ($target -eq [IO.Path]::GetPathRoot($target).TrimEnd('\','/') -or -not (Test-Path -LiteralPath (Join-Path $target 'installation-receipt.json'))) { throw 'Not a recognized owned installation' }
if ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked installation root is not supported' }
$receipt=Get-Content -LiteralPath (Join-Path $target 'installation-receipt.json') -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($receipt.installRoot).TrimEnd('\','/') -ne $target) { throw 'Installation receipt mismatch' }
if ($receipt.home -eq $target -or $receipt.home.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'User data overlaps installation' }
$entry=([IO.Path]::GetFullPath((Join-Path $target 'node_modules/@deepseek-ai/dsh/lib/bin.js'))) -replace '\\','/'
$active=@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and (($_.CommandLine -replace '\\','/').IndexOf($entry,[StringComparison]::OrdinalIgnoreCase) -ge 0) })
if ($active.Count) { throw 'Installation has a running DSH process; stop it using its own runtime entry first' }
if (-not $Apply) { Write-Output "Would recycle owned installation: $target. Home/workspaces preserved.";return }
$safeDelete=Join-Path $env:USERPROFILE '.agents/skills/safe-delete/scripts/recycle.ps1'
if (-not (Test-Path -LiteralPath $safeDelete)) { throw 'Install safe-delete skill to perform a recoverable uninstall. No files changed.' }
& $safeDelete -Mode DriveTrash -Paths @($target)
if ($receipt.userPathRegistration -and -not (Test-Path -LiteralPath $target)) {
 $currentPath=[Environment]::GetEnvironmentVariable('Path','User')
 $remaining=@($currentPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\','/') -ne $target })
 [Environment]::SetEnvironmentVariable('Path',($remaining -join ';'),'User')
}
