[CmdletBinding()]
param([Alias('Home')][string]$OptDshHome, [Alias('Profile')][string]$OptDshProfile, [string]$Workspace, [string]$StateRoot, [string]$Config, [string]$OpticsConfig, [string]$Python, [ValidateRange(1024,65535)][int]$Port=3081, [switch]$OpenBrowser)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'launch-config.ps1')
$ctx=Resolve-OptDshLaunch -Home $OptDshHome -Profile $OptDshProfile -Workspace $Workspace -StateRoot $StateRoot -Config $Config
if (-not $OpticsConfig) {$OpticsConfig=Join-Path $ctx.Home 'config/optics.json'}
$OpticsConfig=[IO.Path]::GetFullPath($OpticsConfig)
if (-not (Test-Path -LiteralPath $OpticsConfig -PathType Leaf)) {throw "Optics configuration required: $OpticsConfig"}
$opt=Get-Content -LiteralPath $OpticsConfig -Raw | ConvertFrom-Json
if (-not $Python) {$Python=if($opt.python){$opt.python}else{'python'}}
if ($Python -match '[/\\]' -and -not [IO.Path]::IsPathRooted($Python)) {$Python=[IO.Path]::GetFullPath($Python,(Split-Path $OpticsConfig -Parent))}
$Python=(Get-Command $Python -ErrorAction Stop).Source
& $Python -c 'import optdsh_optics.server'
if($LASTEXITCODE -ne 0){throw 'Install the optdsh-optics wheel and declared dependencies in the selected interpreter first.'}
$backgroundPython=Join-Path (Split-Path $Python -Parent) 'pythonw.exe'
if(-not (Test-Path -LiteralPath $backgroundPython -PathType Leaf)){throw 'Python environment is missing pythonw.exe; repair this environment before starting the background service.'}
$pidFile=Join-Path $ctx.RuntimeDir 'optics-process.json'
if(Test-Path -LiteralPath $pidFile){
    $old=Get-Content -LiteralPath $pidFile -Raw|ConvertFrom-Json
    $proc=Get-Process -Id $old.pid -ErrorAction SilentlyContinue
    if($proc -and $proc.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$old.startedUtc).UtcDateTime){throw 'This state root already owns a running optics bridge; select its workspace or stop it explicitly.'}
}
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw "Port $Port is occupied."}
$logs=Join-Path $ctx.StateRoot 'logs/optics'
New-Item -ItemType Directory -Path $ctx.RuntimeDir,$logs -Force|Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$argsList=@('-u','-X','utf8','-m','optdsh_optics','serve','--config',('"'+$OpticsConfig+'"'),'--workspace',('"'+$ctx.Workspace+'"'),'--state-root',('"'+$ctx.StateRoot+'"'),'--port',"$Port")
$child=Start-Process -FilePath $backgroundPython -ArgumentList $argsList -WorkingDirectory $ctx.Workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$stamp.stdout.log") -RedirectStandardError (Join-Path $logs "$stamp.stderr.log") -PassThru
[IO.File]::WriteAllText($pidFile,(@{schemaVersion=1;pid=$child.Id;startedUtc=$child.StartTime.ToUniversalTime().ToString('o');python=$Python;workspace=$ctx.Workspace;stateRoot=$ctx.StateRoot;port=$Port;config=$OpticsConfig}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$ready=$false
for($i=0;$i -lt 40;$i++){
    $child.Refresh();if($child.HasExited){throw "Optics exited; inspect $logs"}
    try{
        $access=Get-Content -LiteralPath (Join-Path $ctx.RuntimeDir 'optics-access.json') -Raw|ConvertFrom-Json
        $serviceProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($access.pid)" -ErrorAction Stop
        if(($access.pid -ne $child.Id -and $serviceProcess.ParentProcessId -ne $child.Id) -or $access.workspace -ne $ctx.Workspace -or $access.stateRoot -ne $ctx.StateRoot){throw 'Access record ownership mismatch'}
        $uri=[uri]$access.url
        if($uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or $uri.Port -ne $Port -or $uri.UserInfo){throw 'Invalid optics access URL'}
        $listeners=@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop|Select-Object -ExpandProperty OwningProcess -Unique)
        if($listeners.Count -ne 1 -or $listeners[0] -ne $access.pid){throw 'Optics listener ownership mismatch'}
        $result=Invoke-RestMethod "$($access.url)/api/snapshot" -Headers @{Authorization="Bearer $($access.token)"} -TimeoutSec 2
        $ready=$true;break
    }catch{Start-Sleep -Milliseconds 500}
}
if(-not $ready){throw "Startup not ready; inspect $logs"}
$managed=Get-Process -Id $access.pid -ErrorAction Stop
[IO.File]::WriteAllText($pidFile,(@{schemaVersion=1;pid=$managed.Id;launcherPid=$child.Id;startedUtc=$managed.StartTime.ToUniversalTime().ToString('o');python=$Python;workspace=$ctx.Workspace;stateRoot=$ctx.StateRoot;port=$Port;config=$OpticsConfig}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output "Optics bridge: $($access.url), backend=$($result.backend)"
if($result.error){Write-Output "Capture pending: $($result.error.code); no fallback or automatic retry."}
if($OpenBrowser){& (Join-Path $PSScriptRoot 'open-optics.ps1') -Home $ctx.Home -Profile $ctx.Profile -Workspace $ctx.Workspace -StateRoot $ctx.StateRoot}
