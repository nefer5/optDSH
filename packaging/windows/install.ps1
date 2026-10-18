[CmdletBinding()]
param([string]$ReleaseRoot=(Split-Path (Split-Path $PSScriptRoot -Parent) -Parent), [Parameter(Mandatory)][string]$InstallRoot, [Alias('Home')][string]$OptDshHome=(Join-Path $env:USERPROFILE '.optdsh'), [string]$Workspace=(Get-Location).Path, [string[]]$Components=@('core'), [ValidateSet('none','market','recommended')][string]$PluginPreset='none', [string]$CanvasRoot, [switch]$InstallCanvas, [string]$CanvasInstallRoot, [int]$CanvasPort=4173, [switch]$AddToUserPath, [switch]$DryRun)
$ErrorActionPreference='Stop'
function Get-ReleaseHash([string]$Path) {
 $stream=[IO.File]::OpenRead($Path)
 $sha=[Security.Cryptography.SHA256]::Create()
 try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
 finally { $sha.Dispose();$stream.Dispose() }
}
$ReleaseRoot=[IO.Path]::GetFullPath($ReleaseRoot)
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$OptDshHome=[IO.Path]::GetFullPath($OptDshHome)
if ($InstallRoot.TrimEnd('\','/') -eq [IO.Path]::GetPathRoot($InstallRoot).TrimEnd('\','/')) { throw 'InstallRoot must not be a drive root' }
if ($OptDshHome -eq $InstallRoot -or $OptDshHome.StartsWith($InstallRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Home must be outside InstallRoot' }
$manifest=Get-Content -LiteralPath (Join-Path $ReleaseRoot 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) { throw 'Unsupported release manifest' }
$selected=@('core')+@($Components | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'core' } | Select-Object -Unique)
$canvasArtifact=$null
if($CanvasRoot -and $InstallCanvas){throw 'Select existing CanvasRoot or InstallCanvas, not both'}
if($CanvasRoot -or $InstallCanvas){
 if('canvas' -notin $selected){throw 'Select the canvas component when configuring the editor'}
 if($CanvasPort -lt 1024 -or $CanvasPort -gt 65535){throw 'CanvasPort must be 1024..65535'}
 if($InstallCanvas){
  if(-not $CanvasInstallRoot -or -not $manifest.canvasEditor){throw 'Select a new CanvasInstallRoot and a release containing the local Canvas editor package'}
  $canvasArtifact=[IO.Path]::GetFullPath((Join-Path $ReleaseRoot $manifest.canvasEditor.file))
  if(-not $canvasArtifact.StartsWith($ReleaseRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Canvas artifact escapes release root'}
  if((Get-ReleaseHash $canvasArtifact) -ne $manifest.canvasEditor.sha256){throw 'Canvas editor artifact hash mismatch'}
 }
}
$artifacts=@()
foreach ($id in $selected) {
 $rows=@($manifest.components | Where-Object id -eq $id)
 if ($rows.Count -ne 1) { throw "Unknown/duplicate component: $id" }
 $item=$rows[0];$path=[IO.Path]::GetFullPath((Join-Path $ReleaseRoot $item.file))
 if (-not $path.StartsWith($ReleaseRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Artifact escapes release root' }
 if ((Get-ReleaseHash $path) -ne $item.sha256) { throw "Artifact hash mismatch: $id" }
 $artifacts+=@{item=$item; path=$path}
}
$launcherArtifact=$null
if ($manifest.launcher) {
 $launcherArtifact=[IO.Path]::GetFullPath((Join-Path $ReleaseRoot $manifest.launcher.file))
 if (-not $launcherArtifact.StartsWith($ReleaseRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Launcher artifact escapes release root' }
 if ((Get-ReleaseHash $launcherArtifact) -ne $manifest.launcher.sha256) { throw 'Launcher artifact hash mismatch' }
}
$buildInfoArtifact=$null
if ($manifest.buildInfo) {
 $buildInfoArtifact=[IO.Path]::GetFullPath((Join-Path $ReleaseRoot $manifest.buildInfo.file))
 if (-not $buildInfoArtifact.StartsWith($ReleaseRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Build identity escapes release root' }
 if ((Get-ReleaseHash $buildInfoArtifact) -ne $manifest.buildInfo.sha256) { throw 'Build identity hash mismatch' }
}
$profilePluginScript=Join-Path $ReleaseRoot 'packaging/windows/install-profile-plugins.ps1'
$pluginSnapshot=Join-Path $ReleaseRoot 'packaging/windows/plugins.snapshot.json'
$community=@()
if ($PluginPreset -ne 'none') {
 if (-not $manifest.profilePlugins -or $manifest.profilePlugins.file -ne 'packaging/windows/plugins.snapshot.json') { throw 'Release has no verified plugin recommendation manifest' }
 if ((Get-ReleaseHash $pluginSnapshot) -ne $manifest.profilePlugins.sha256) { throw 'Plugin recommendation hash mismatch' }
 $snapshot=Get-Content -LiteralPath $pluginSnapshot -Raw -Encoding UTF8 | ConvertFrom-Json
 if ($snapshot.targetDsh -ne $manifest.dshVersion) { throw 'Plugin recommendations target a different DSH version' }
 $selectedCommunity=@(if($PluginPreset -eq 'market'){$snapshot.plugins|Where-Object { $_.name -eq 'dshmarket' -and $_.enabled }}else{$snapshot.plugins|Where-Object enabled})
 if (-not $selectedCommunity.Count -or @($selectedCommunity|Where-Object name -eq 'dshmarket').Count -ne 1) { throw 'Selected plugin preset must contain the marketplace exactly once' }
 $community=& $profilePluginScript -InstallRoot $InstallRoot -Home $OptDshHome -Snapshot $pluginSnapshot -Names ($selectedCommunity.name -join ',') | ConvertFrom-Json
 $community=@($community)
}
$plan=@{productVersion=$manifest.version;buildId=$manifest.buildId;sourceRevision=$manifest.sourceRevision;installRoot=$InstallRoot;home=$OptDshHome;workspace=$Workspace;components=$selected;dshVersion=$manifest.dshVersion;runtimeBundled=$false;pluginPreset=$PluginPreset;communityPlugins=$community;communityPluginStatus='not-selected';profileComponentStatus=$(if(@($selected|Where-Object {$_ -in @('canvas','workbench','forms')}).Count){'pending'}else{'not-selected'});userPathRegistration=[bool]$AddToUserPath}
$plan.profileComponents=@{}
foreach($id in @('canvas','workbench','forms')){if($id -in $selected){$plan.profileComponents[$id]=@{status='pending';receipt="profile-$id-receipt.json"}}}
$plan.canvasEditorStatus=if($CanvasRoot -or $InstallCanvas){'pending'}else{'not-configured'}
if ($DryRun) { $plan | ConvertTo-Json -Depth 8;return }
if (Test-Path -LiteralPath $InstallRoot) { throw 'InstallRoot already exists; install a new version beside it. Existing files were not changed.' }
$nodeExecutable=(Get-Command node.exe -ErrorAction Stop).Source
$nodeMajor=[int]((& $nodeExecutable --version).TrimStart('v').Split('.')[0]);if ($nodeMajor -lt 24) { throw 'Install Node.js 24 or newer first' }
$npmCommand=(Get-Command npm.cmd -ErrorAction Stop).Source
$npmCli=Join-Path (Split-Path $npmCommand -Parent) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) { throw 'The Node.js installation must include npm; its npm-cli.js could not be located.' }
New-Item -ItemType Directory -Path $InstallRoot | Out-Null
$dependencies=@{'@deepseek-ai/dsh'=$manifest.dshVersion}
foreach ($a in $artifacts) { if ($a.item.id -notin @('canvas','workbench','forms')) { $dependencies[$a.item.name]='file:'+($a.path -replace '\\','/') } }
$package=@{name='optdsh-user-installation';private=$true;type='module';dependencies=$dependencies}
$package | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $InstallRoot 'package.json') -Encoding utf8
$plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $InstallRoot 'installation-receipt.json') -Encoding utf8
Push-Location $InstallRoot
try { & $nodeExecutable $npmCli install --no-audit --no-fund;if ($LASTEXITCODE) { throw 'Dependency installation failed; receipt retained for diagnosis' } } finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $ReleaseRoot 'scripts') -Destination $InstallRoot -Recurse
Copy-Item -LiteralPath (Join-Path $ReleaseRoot 'docs') -Destination $InstallRoot -Recurse
if ($buildInfoArtifact) { Copy-Item -LiteralPath $buildInfoArtifact -Destination (Join-Path $InstallRoot 'build-info.json') }
Copy-Item -LiteralPath (Join-Path $ReleaseRoot 'release-manifest.json') -Destination (Join-Path $InstallRoot 'release-manifest.json')
if ($launcherArtifact) { Copy-Item -LiteralPath $launcherArtifact -Destination (Join-Path $InstallRoot 'optdsh.exe') }
@{schemaVersion=1;installRoot='.';nodeExecutable=$nodeExecutable;home=$OptDshHome;workspace=$Workspace;profile='web';port=3080;components=$selected} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $InstallRoot 'optdsh-launcher.json') -Encoding utf8
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
foreach ($componentId in @('canvas','workbench','forms')) {
 if ($componentId -notin $selected) { continue }
 $runtimeLog=Join-Path $InstallRoot '.runtime'
 New-Item -ItemType Directory -Path $runtimeLog -Force|Out-Null
 try {
  $componentArtifact=@($artifacts|Where-Object {$_.item.id -eq $componentId})[0]
  & (Join-Path $ReleaseRoot 'packaging/windows/install-profile-component.ps1') -Component $componentId -InstallRoot $InstallRoot -Home $OptDshHome -Profile web -Package $componentArtifact.path -Operation Install -ReceiptPath (Join-Path $InstallRoot "profile-$componentId-receipt.json") -Apply *> (Join-Path $runtimeLog "profile-$componentId-install.log")
  $plan.profileComponents[$componentId].status='installed-or-existing-preserved'
  $plan.profileComponentStatus='installed-or-existing-preserved'
 } catch {
  $plan.profileComponents[$componentId].status='incomplete'
  $plan.profileComponentStatus='incomplete';$plan.coreInstalled=$true
  $plan|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $InstallRoot 'installation-receipt.json') -Encoding utf8
  throw "Platform retained; the $componentId Profile installation is incomplete. Inspect profile-$componentId-receipt.json and .runtime/profile-$componentId-install.log before retrying."
 }
 $plan|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $InstallRoot 'installation-receipt.json') -Encoding utf8
}
if($CanvasRoot -or $InstallCanvas){
 try{
  $canvasArguments=@{DshHome=$OptDshHome;Port=$CanvasPort}
  if($InstallCanvas){$canvasArguments.Package=$canvasArtifact;$canvasArguments.InstallRoot=$CanvasInstallRoot}else{$canvasArguments.CanvasRoot=$CanvasRoot}
  & (Join-Path $InstallRoot 'scripts/runtime/setup-canvas.ps1') @canvasArguments
  $plan.canvasEditorStatus='configured-not-runtime-verified'
 }catch{
  $plan.canvasEditorStatus='incomplete';$plan.coreInstalled=$true
  $plan|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $InstallRoot 'installation-receipt.json') -Encoding utf8
  throw 'Platform retained; Canvas configuration failed. Inspect the selected installation and reconnect with setup-canvas.ps1.'
 }
 $plan|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $InstallRoot 'installation-receipt.json') -Encoding utf8
}
if ($PluginPreset -ne 'none') {
 $runtimeLog=Join-Path $InstallRoot '.runtime'
 New-Item -ItemType Directory -Path $runtimeLog -Force|Out-Null
 $communityReceipt=Join-Path $InstallRoot 'community-plugins-receipt.json'
 try {
  & $profilePluginScript -InstallRoot $InstallRoot -Home $OptDshHome -Snapshot $pluginSnapshot -Names ($selectedCommunity.name -join ',') -ReceiptPath $communityReceipt -PreserveExisting -Apply *> (Join-Path $runtimeLog 'community-install.log')
  $plan.communityPluginStatus='installed-or-existing-preserved'
 } catch {
  $plan.communityPluginStatus='incomplete';$plan.coreInstalled=$true
  $plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $InstallRoot 'installation-receipt.json') -Encoding utf8
  throw 'The platform is installed, but the selected community plugin preset is incomplete. The program and Home were retained; inspect its receipt and private runtime log.'
 }
 $plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $InstallRoot 'installation-receipt.json') -Encoding utf8
}
if ($AddToUserPath) {
 $previousPath=[Environment]::GetEnvironmentVariable('Path','User')
 $entries=@($previousPath -split ';' | Where-Object { $_ })
 if ($InstallRoot -notin $entries) { [Environment]::SetEnvironmentVariable('Path',(($entries+$InstallRoot)-join ';'),'User') }
 Write-Output 'User PATH updated; open a new terminal, then use optdsh from any research directory.'
}
Write-Output "Installed to $InstallRoot. Double-click optdsh.exe, or use optdsh.cmd --workspace <research>. Python/Zemax/Canvas are separately installed when selected."
