[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$InstallRoot,
 [Alias('Home')][Parameter(Mandatory)][string]$OptDshHome,
 [Alias('Profile')][string]$OptDshProfile='web',
 [ValidateSet('canvas','workbench','forms','experts')][string]$Component='canvas',
 [string]$Package,
 [ValidateSet('Install','Upgrade','Remove')][string]$Operation='Install',
 [string]$ReceiptPath,
 [switch]$Apply
)
$ErrorActionPreference='Stop'
if ($OptDshProfile -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$' -or $OptDshProfile -eq 'desktop') { throw 'Invalid profile' }
$componentPackages=@{canvas='optdsh-agent-canvas';workbench='optdsh-workbench';forms='optdsh-forms';experts='optdsh-experts'}
$name=$componentPackages[$Component]
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$OptDshHome=[IO.Path]::GetFullPath($OptDshHome)
$profileRoot=Join-Path $OptDshHome "profiles/$OptDshProfile"
$profileManifest=Join-Path $profileRoot 'package.json'
$existing=$null
if (Test-Path -LiteralPath $profileManifest) { $existing=Get-Content -LiteralPath $profileManifest -Raw -Encoding UTF8|ConvertFrom-Json }
$installed=[bool]($existing -and $existing.dependencies -and $existing.dependencies.PSObject.Properties[$name])
$requested=$null
if ($Operation -ne 'Remove') {
 if (-not $Package) { throw 'Install and Upgrade require the selected component local .tgz package' }
 $Package=[IO.Path]::GetFullPath($Package)
 if (-not (Test-Path -LiteralPath $Package -PathType Leaf) -or [IO.Path]::GetExtension($Package) -ne '.tgz') { throw 'Package must be an existing local .tgz file' }
 # Read only the npm tarball metadata. No package code is imported or executed.
 $reader=@'
const fs=require('node:fs'),zlib=require('node:zlib');
const file=process.argv[1],expected=process.argv[2];if(fs.statSync(file).size>64*1024*1024)throw Error('Package too large');
const tar=zlib.gunzipSync(fs.readFileSync(file),{maxOutputLength:64*1024*1024});
for(let offset=0;offset+512<=tar.length;){
 const h=tar.subarray(offset,offset+512),name=h.subarray(0,100).toString().replace(/\0.*$/s,''),size=parseInt(h.subarray(124,136).toString().replace(/\0.*$/s,'').trim()||'0',8);
 if(!Number.isFinite(size)||size<0||offset+512+size>tar.length)throw Error('Invalid tar header');
 if(name==='package/package.json'){const p=JSON.parse(tar.subarray(offset+512,offset+512+size));if(p.name!==expected||typeof p.version!=='string')throw Error('Wrong Profile component package');process.stdout.write(JSON.stringify({name:p.name,version:p.version}));process.exit(0)}
 offset+=512+Math.ceil(size/512)*512;
}throw Error('Missing npm package metadata');
'@
 $metadata=& node -e $reader $Package $name
 if ($LASTEXITCODE) { throw "Invalid component tarball; expected $name" }
 $requested=$metadata|ConvertFrom-Json
}
if ($Operation -eq 'Upgrade' -and -not $installed) { throw "$name is not installed in this Profile; use Install first" }
$result=@{schemaVersion=1;component=$Component;name=$name;profile=$OptDshProfile;operation=$Operation;installedBefore=$installed;requestedVersion=$(if($requested){$requested.version}else{$null});status='planned';loadedVerified=$false;enablementOwner='official-profile'}
if (-not $Apply) { $result|ConvertTo-Json -Depth 6;return }
$savedHome=$env:DSH_HOME;$savedPath=$env:PATH
function Invoke-OfficialProfileCommand([string[]]$CommandArgs) {
 # PS5 treats stderr redirected by a parent script as NativeCommandError.
 # DSH writes ordinary initialization notices there: use its exit code and
 # keep diagnostic text, rather than classifying every notice as a failure.
 $nativePreference=$ErrorActionPreference
 try {
  $ErrorActionPreference='Continue'
  & node $entry @CommandArgs 2>&1 | ForEach-Object { $_.ToString() }
  $nativeExit=$LASTEXITCODE
 } finally { $ErrorActionPreference=$nativePreference }
 if($nativeExit){throw 'Official Profile package operation failed; inspect the retained Profile and logs before retrying'}
}
try {
 $leaseFile=Join-Path $OptDshHome ".runtime/profiles/$OptDshProfile/host.json"
 if (Test-Path -LiteralPath $leaseFile) {
  $lease=Get-Content -LiteralPath $leaseFile -Raw|ConvertFrom-Json
  $hostProcess=Get-Process -Id $lease.pid -ErrorAction SilentlyContinue
  if ($hostProcess -and $hostProcess.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$lease.startedUtc).UtcDateTime) { throw 'Profile is running; stop it before package installation, upgrade or removal' }
 }
 $entry=Join-Path $InstallRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js'
 $localPnpm=Join-Path $InstallRoot 'node_modules/.bin/pnpm.cmd'
 if (-not (Test-Path -LiteralPath $entry) -or -not (Test-Path -LiteralPath $localPnpm)) { throw 'Install the product and its declared package manager before Profile components' }
 $env:DSH_HOME=$OptDshHome;$env:PATH=(Split-Path $localPnpm -Parent)+';'+$savedPath
 if ($Operation -eq 'Install' -and $installed) { $result.status='existing-preserved' }
 elseif ($Operation -eq 'Remove' -and -not $installed) { $result.status='already-absent' }
 else {
  if ($Operation -ne 'Remove') {
   if (-not ($existing -and $existing.dependencies -and $existing.dependencies.PSObject.Properties['@deepseek-ai/cordis'])) {
    Invoke-OfficialProfileCommand -CommandArgs @('plugin','--profile',$OptDshProfile,'add','@deepseek-ai/cordis@4.0.5','--config.auto-install-peers=false')
   }
   Invoke-OfficialProfileCommand -CommandArgs @('plugin','--profile',$OptDshProfile,'add',$Package,'--config.auto-install-peers=false')
  } else { Invoke-OfficialProfileCommand -CommandArgs @('plugin','--profile',$OptDshProfile,'remove',$name) }
  $result.status=switch($Operation){Install{'installed'}Upgrade{'upgraded'}Remove{'removed'}}
 }
} catch { $result.status='incomplete';throw }
finally {
 $env:DSH_HOME=$savedHome;$env:PATH=$savedPath
 if ($ReceiptPath) {
  $destination=[IO.Path]::GetFullPath($ReceiptPath)
  New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force|Out-Null
  [IO.File]::WriteAllText($destination,($result|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
 }
}
$result|ConvertTo-Json -Depth 6
