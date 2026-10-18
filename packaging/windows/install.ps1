[CmdletBinding()]
param([string]$ReleaseRoot=(Split-Path (Split-Path $PSScriptRoot -Parent) -Parent), [Parameter(Mandatory)][string]$InstallRoot, [Alias('Home')][string]$OptDshHome=(Join-Path $env:USERPROFILE '.optdsh'), [string]$Workspace=(Get-Location).Path, [string[]]$Components=@('core'), [switch]$AddToUserPath, [switch]$DryRun)
$ErrorActionPreference='Stop'
$ReleaseRoot=[IO.Path]::GetFullPath($ReleaseRoot)
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$OptDshHome=[IO.Path]::GetFullPath($OptDshHome)
if ($InstallRoot.TrimEnd('\','/') -eq [IO.Path]::GetPathRoot($InstallRoot).TrimEnd('\','/')) { throw 'InstallRoot must not be a drive root' }
if ($OptDshHome -eq $InstallRoot -or $OptDshHome.StartsWith($InstallRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Home must be outside InstallRoot' }
$manifest=Get-Content -LiteralPath (Join-Path $ReleaseRoot 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) { throw 'Unsupported release manifest' }
$selected=@('core')+@($Components | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'core' } | Select-Object -Unique)
$artifacts=@()
foreach ($id in $selected) {
 $rows=@($manifest.components | Where-Object id -eq $id)
 if ($rows.Count -ne 1) { throw "Unknown/duplicate component: $id" }
 $item=$rows[0];$path=[IO.Path]::GetFullPath((Join-Path $ReleaseRoot $item.file))
 if (-not $path.StartsWith($ReleaseRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Artifact escapes release root' }
 if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $item.sha256) { throw "Artifact hash mismatch: $id" }
 $artifacts+=@{item=$item; path=$path}
}
$launcherArtifact=$null
if ($manifest.launcher) {
 $launcherArtifact=[IO.Path]::GetFullPath((Join-Path $ReleaseRoot $manifest.launcher.file))
 if (-not $launcherArtifact.StartsWith($ReleaseRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Launcher artifact escapes release root' }
 if ((Get-FileHash -LiteralPath $launcherArtifact -Algorithm SHA256).Hash -ne $manifest.launcher.sha256) { throw 'Launcher artifact hash mismatch' }
}
$plan=@{installRoot=$InstallRoot;home=$OptDshHome;workspace=$Workspace;components=$selected;dshVersion=$manifest.dshVersion;runtimeBundled=$false;userPathRegistration=[bool]$AddToUserPath}
if ($DryRun) { $plan | ConvertTo-Json -Depth 5;return }
if (Test-Path -LiteralPath $InstallRoot) { throw 'InstallRoot already exists; install a new version beside it. Existing files were not changed.' }
$nodeMajor=[int]((& node --version).TrimStart('v').Split('.')[0]);if ($nodeMajor -ne 24) { throw 'Install Node.js 24 first' }
New-Item -ItemType Directory -Path $InstallRoot | Out-Null
$dependencies=@{'@deepseek-ai/dsh'=$manifest.dshVersion}
foreach ($a in $artifacts) { $dependencies[$a.item.name]='file:'+($a.path -replace '\\','/') }
$package=@{name='optdsh-user-installation';private=$true;type='module';dependencies=$dependencies}
$package | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $InstallRoot 'package.json') -Encoding utf8
$plan | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $InstallRoot 'installation-receipt.json') -Encoding utf8
Push-Location $InstallRoot
try { npm install --no-audit --no-fund;if ($LASTEXITCODE) { throw 'Dependency installation failed; receipt retained for diagnosis' } } finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $ReleaseRoot 'scripts') -Destination $InstallRoot -Recurse
Copy-Item -LiteralPath (Join-Path $ReleaseRoot 'docs') -Destination $InstallRoot -Recurse
if ($launcherArtifact) { Copy-Item -LiteralPath $launcherArtifact -Destination (Join-Path $InstallRoot 'optdsh.exe') }
@{schemaVersion=1;installRoot='.';nodeExecutable=(Get-Command node.exe).Source;home=$OptDshHome;workspace=$Workspace;profile='web';port=3080;components=$selected} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $InstallRoot 'optdsh-launcher.json') -Encoding utf8
$launcher=Join-Path $InstallRoot 'optdsh.ps1'
@'
[CmdletBinding()]
param([string]$Workspace=(Get-Location).Path, [Alias('Home')][string]$OptDshHome, [int]$Port=3080, [switch]$NoBrowser)
$settings=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'installation-receipt.json') -Raw | ConvertFrom-Json
if (-not $OptDshHome) { $OptDshHome=$settings.home }
& (Join-Path $PSScriptRoot 'scripts/runtime/start-dsh.ps1') -Home $OptDshHome -Workspace $Workspace -Components $settings.components -Port $Port -OpenBrowser:(-not $NoBrowser)
'@ | Set-Content -LiteralPath $launcher -Encoding utf8
@'
@echo off
node "%~dp0node_modules\optdsh-bundle\lib\launcher.mjs" --config "%~dp0optdsh-launcher.json" %*
exit /b %errorlevel%
'@ | Set-Content -LiteralPath (Join-Path $InstallRoot 'optdsh.cmd') -Encoding ascii
if ($AddToUserPath) {
 $previousPath=[Environment]::GetEnvironmentVariable('Path','User')
 $entries=@($previousPath -split ';' | Where-Object { $_ })
 if ($InstallRoot -notin $entries) { [Environment]::SetEnvironmentVariable('Path',(($entries+$InstallRoot)-join ';'),'User') }
 Write-Output 'User PATH updated; open a new terminal, then use optdsh from any research directory.'
}
Write-Output "Installed to $InstallRoot. Run pwsh -File `"$launcher`" -Workspace <research>. Python/Zemax/Canvas are separately installed when selected."
