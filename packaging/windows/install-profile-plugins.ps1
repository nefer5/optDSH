[CmdletBinding()]
param([Parameter(Mandatory)][string]$InstallRoot,[Alias('Home')][Parameter(Mandatory)][string]$OptDshHome,[Alias('Profile')][string]$OptDshProfile='web',[string]$Snapshot=(Join-Path $PSScriptRoot 'plugins.snapshot.json'),[string[]]$Names,[string]$ReceiptPath,[switch]$PreserveExisting,[switch]$Apply)
$ErrorActionPreference='Stop'
if ($OptDshProfile -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$' -or $OptDshProfile -eq 'desktop') { throw 'Invalid profile' }
$items=(Get-Content -LiteralPath $Snapshot -Raw -Encoding UTF8 | ConvertFrom-Json).plugins
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
$results=@()
$existing=$null
$profileManifest=Join-Path $profileRoot 'package.json'
if (Test-Path -LiteralPath $profileManifest) { $existing=Get-Content -LiteralPath $profileManifest -Raw -Encoding UTF8 | ConvertFrom-Json }
try {
 $env:DSH_HOME=$OptDshHome
 $env:PATH=(Split-Path $localPnpm -Parent)+";"+$savedPath
 foreach ($item in $chosen) {
  if ($PreserveExisting -and $existing -and $existing.dependencies -and $existing.dependencies.PSObject.Properties[$item.name]) {
   $results+=@{name=$item.name;requestedVersion=$item.version;status='existing-preserved';enabled=($item.name -in @($existing.dsh.profile.bundles));loadedVerified=$false}
   continue
  }
  & node $entry plugin --profile $OptDshProfile add ($item.name+'@'+$item.version) --config.auto-install-peers=false
  if ($LASTEXITCODE) { $results+=@{name=$item.name;requestedVersion=$item.version;status='failed';loadedVerified=$false}; throw "Plugin installation failed: $($item.name). No version exemption was granted; inspect compatibility and network before retrying." }
  $results+=@{name=$item.name;requestedVersion=$item.version;status='installed';loadedVerified=$false}
 }
}finally{
 $env:DSH_HOME=$savedHome;$env:PATH=$savedPath
 if ($ReceiptPath) {
  foreach ($item in $chosen) { if ($item.name -notin @($results.name)) { $results+=@{name=$item.name;requestedVersion=$item.version;status='not-attempted';loadedVerified=$false} } }
  $state=if(@($results | Where-Object { $_.status -in @('failed','not-attempted') }).Count){'incomplete'}else{'installed-or-existing-preserved'}
  $report=@{schemaVersion=1;profile=$OptDshProfile;status=$state;preserveExisting=[bool]$PreserveExisting;plugins=@($results)}
  $destination=[IO.Path]::GetFullPath($ReceiptPath)
  New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force|Out-Null
  [IO.File]::WriteAllText($destination,($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 }
}
Write-Output 'Selected packages processed. Verify official bundle registration, actual load and interaction separately; disabled snapshot entries were skipped.'
