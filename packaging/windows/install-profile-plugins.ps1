[CmdletBinding()]
param([Parameter(Mandatory)][string]$InstallRoot,[Alias('Home')][Parameter(Mandatory)][string]$OptDshHome,[Alias('Profile')][string]$OptDshProfile='web',[string]$Snapshot=(Join-Path $PSScriptRoot 'plugins.snapshot.json'),[string[]]$Names,[switch]$Apply)
$ErrorActionPreference='Stop'
if ($OptDshProfile -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$' -or $OptDshProfile -eq 'desktop') { throw 'Invalid profile' }
$items=(Get-Content -LiteralPath $Snapshot -Raw | ConvertFrom-Json).plugins
if ($Names) { $Names=@($Names | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
$chosen=if($Names){@($items | Where-Object name -in $Names)}else{@($items | Where-Object enabled)}
if ($Names -and @($Names | Where-Object { $_ -notin $items.name }).Count) { throw 'Unknown plugin selection' }
if (@($chosen | Where-Object { -not $_.enabled }).Count) { throw 'A disabled snapshot entry was selected; preserve its disabled state and review separately' }
foreach ($item in $chosen) { if ($item.name -notmatch '^(?:@[a-z0-9._-]+/)?[a-z0-9._-]+$' -or $item.version -notmatch '^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$') { throw 'Invalid package/version in snapshot' } }
if (-not $Apply) { $chosen | Select-Object name,version,enabled,compatibility | ConvertTo-Json;return }
$profileRoot=Join-Path $OptDshHome "profiles/$OptDshProfile"
$leaseFile=Join-Path $OptDshHome ".runtime/profiles/$OptDshProfile/host.json"
if (Test-Path -LiteralPath $leaseFile) { $lease=Get-Content -LiteralPath $leaseFile -Raw | ConvertFrom-Json; $process=Get-Process -Id $lease.pid -ErrorAction SilentlyContinue;if ($process -and $process.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$lease.startedUtc).UtcDateTime) { throw 'Profile is running; stop it before dependency changes' } }
$entry=Join-Path $InstallRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js'
$savedHome=$env:DSH_HOME
$savedPath=$env:PATH
$localPnpm=Join-Path $InstallRoot "node_modules/.bin/pnpm.cmd"
if (-not (Test-Path -LiteralPath $localPnpm)) { throw "The product package manager is missing; install the declared optdsh-bundle dependencies first" }
try {
 $env:DSH_HOME=$OptDshHome
 $env:PATH=(Split-Path $localPnpm -Parent)+";"+$savedPath
 foreach ($item in $chosen) {
  & node $entry plugin --profile $OptDshProfile add ($item.name+'@'+$item.version) --config.auto-install-peers=false
  if ($LASTEXITCODE) { throw "Plugin installation failed: $($item.name). No version exemption was granted; inspect compatibility and network before retrying." }
 }
}finally{$env:DSH_HOME=$savedHome;$env:PATH=$savedPath}
Write-Output 'Selected packages processed. Verify official bundle registration, actual load and interaction separately; disabled snapshot entries were skipped.'
