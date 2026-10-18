[CmdletBinding()]
param([Parameter(Mandatory)][string]$InstallRoot,[switch]$Apply,[switch]$ConfirmUi,[switch]$StopRunning,[int]$WaitForProcessId=0,[string[]]$Items=@('program'))
$ErrorActionPreference='Stop'
if($ConfirmUi){Add-Type -AssemblyName System.Windows.Forms}
try {
 $target=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\','/')
 if($target -eq [IO.Path]::GetPathRoot($target).TrimEnd('\','/') -or -not(Test-Path -LiteralPath (Join-Path $target 'installation-receipt.json'))){throw '不是可识别的optDSH安装目录，未修改任何文件。'}
 if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '安装根目录是链接，不能自动卸载。'}
 $receipt=Get-Content -LiteralPath (Join-Path $target 'installation-receipt.json') -Raw|ConvertFrom-Json
 if([IO.Path]::GetFullPath($receipt.installRoot).TrimEnd('\','/') -ne $target){throw '安装回执与程序目录不匹配。'}
 $dataPaths=@($receipt.home,$receipt.workspace)|Where-Object{$_}|ForEach-Object{[IO.Path]::GetFullPath($_).TrimEnd('\','/')}
 foreach($dataPath in $dataPaths){if($dataPath -eq $target -or $dataPath.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw '用户资料或课题位于程序目录内，已拒绝卸载以保留数据。'}}
 $selected=@($Items|ForEach-Object{$_-split ','}|Where-Object{$_}|Select-Object -Unique)
 $allowed=@('program','logs','plugin:canvas','plugin:workbench','plugin:forms','plugin:experts')
 if(-not $selected.Count -or @($selected|Where-Object{$_-notin$allowed}).Count){throw '请选择有效的程序、插件或运行日志项目。'}
 $settingsPath=Join-Path $target 'optdsh-launcher.json'
 $settings=if(Test-Path -LiteralPath $settingsPath){Get-Content -LiteralPath $settingsPath -Raw|ConvertFrom-Json}else{$null}
 $profile=if($settings -and $settings.profile){$settings.profile}else{'web'}
 $stateRoot=if($settings -and $settings.stateRoot){[IO.Path]::GetFullPath($settings.stateRoot)}else{Join-Path $receipt.home "state/$profile"}
 if('program'-in$selected){
  $owned=@('node_modules','scripts','docs','packaging','.runtime','package.json','package-lock.json','build-info.json','release-manifest.json','PORTS.md','installation-receipt.json','optdsh.exe','optdsh.cmd','optdsh.ps1','optdsh-launcher.json','卸载optDSH.exe','卸载optDSH.cmd','community-plugins-receipt.json','profile-canvas-receipt.json','profile-workbench-receipt.json','profile-forms-receipt.json','profile-experts-receipt.json')
  $unknown=@(Get-ChildItem -LiteralPath $target -Force|Where-Object{$_.Name-notin$owned})
  if($unknown.Count){throw ('程序目录含未登记文件，已保留整个目录。请先移走个人文件：'+(($unknown|ForEach-Object{$_.FullName})-join '；'))}
 }
 if('logs'-in$selected){
  $logRoot=[IO.Path]::GetFullPath((Join-Path $stateRoot 'logs')).TrimEnd('\','/')
  if($receipt.workspace -and ([IO.Path]::GetFullPath($receipt.workspace).StartsWith($logRoot+'\',[StringComparison]::OrdinalIgnoreCase)-or[IO.Path]::GetFullPath($receipt.workspace)-eq$logRoot)){throw '课题与日志目录重叠，拒绝回收。'}
 }
 $workspacePaths=@(@($receipt.workspace)|Where-Object{$_})
 $registryPath=Join-Path $receipt.home 'storages/workspace.json'
 if(Test-Path -LiteralPath $registryPath){
  $registry=Get-Content -LiteralPath $registryPath -Raw|ConvertFrom-Json
  if(-not $registry.tables -or -not $registry.tables.workspaces){throw '无法核验课题登记，拒绝自动卸载。'}
  foreach($record in $registry.tables.workspaces.PSObject.Properties){if($record.Value.path){$workspacePaths+=$record.Value.path}}
 }
 foreach($workspacePath in $workspacePaths){
  $protected=[IO.Path]::GetFullPath($workspacePath).TrimEnd('\','/')
  foreach($candidate in @($(if('program'-in$selected){$target}),$(if('logs'-in$selected){$logRoot}))|Where-Object{$_}){
   if($candidate-eq$protected -or $protected.StartsWith($candidate+'\',[StringComparison]::OrdinalIgnoreCase)-or$candidate.StartsWith($protected+'\',[StringComparison]::OrdinalIgnoreCase)){throw ('卸载范围与课题目录重叠，已拒绝操作：'+$protected)}
  }
 }
 $entry=([IO.Path]::GetFullPath((Join-Path $target 'node_modules/@deepseek-ai/dsh/lib/bin.js'))).Replace([char]92,[char]47)
 $active=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object{$_.CommandLine -and ($_.CommandLine.Replace([char]92,[char]47).IndexOf($entry,[StringComparison]::OrdinalIgnoreCase)-ge 0)})
 if(-not $Apply){[pscustomobject]@{status='planned';program=$target;selected=$selected;preserved=$dataPaths;runningProcesses=$active.Count}|ConvertTo-Json;return}
 if($ConfirmUi){
  $answer=[System.Windows.Forms.MessageBox]::Show("只卸载这个optDSH程序：`n$target`n`n保留资料Home、会话、课题、模型、画板和运行结果。共享AgentCanvas不会卸载。`n若本程序服务仍在运行，会核验后关闭；请先结束正在执行的任务。`n`n确定卸载程序吗？",'卸载optDSH',[System.Windows.Forms.MessageBoxButtons]::YesNo,[System.Windows.Forms.MessageBoxIcon]::Question)
  if($answer-ne[System.Windows.Forms.DialogResult]::Yes){return}
 }
 if($WaitForProcessId-gt 0){Wait-Process -Id $WaitForProcessId -Timeout 10 -ErrorAction SilentlyContinue;if(Get-Process -Id $WaitForProcessId -ErrorAction SilentlyContinue){throw '卸载入口仍在运行，请稍后重试。'}}
 if($active.Count){
  if(-not $StopRunning){throw '本程序服务仍在运行，请结束任务后使用-StopRunning或图形卸载入口。'}
  $leases=@(Get-ChildItem -LiteralPath (Join-Path $receipt.home '.runtime/profiles') -Filter host.json -Recurse -File -ErrorAction SilentlyContinue)
  foreach($process in $active){
   $owned=$false
   foreach($leaseFile in $leases){
    $lease=Get-Content -LiteralPath $leaseFile.FullName -Raw|ConvertFrom-Json
    if($lease.pid-ne$process.ProcessId){continue}
    $state=Get-Content -LiteralPath (Join-Path $lease.stateRoot '.runtime/dsh-host.json') -Raw|ConvertFrom-Json
    & (Join-Path $target 'scripts/runtime/stop-dsh.ps1') -Home $state.home -Profile $state.profile -Workspace $state.workspace -StateRoot $state.stateRoot -Port $state.port
    $owned=$true;break
   }
   if(-not $owned){throw '发现程序进程但无法核验归属，请先停止本程序。没有删除文件。'}
  }
 }
 $removedPlugins=@()
 foreach($id in @('canvas','workbench','forms','experts')){
  if(('plugin:'+$id)-in$selected){
   & (Join-Path $PSScriptRoot 'install-profile-component.ps1') -InstallRoot $target -Home $receipt.home -Profile $profile -Component $id -Operation Remove -Apply
   if($LASTEXITCODE){throw "插件$id卸载未完成，程序与用户资料仍保留。"}
   $removedPlugins+=$id
  }
 }
 $targets=@()
 if('logs'-in$selected -and(Test-Path -LiteralPath $logRoot)){$targets+=$logRoot}
 if('program'-in$selected){$targets+=$target}
 $output=@()
 if($targets.Count){
  $helper=Join-Path $PSScriptRoot 'recycle.ps1'
  if(-not(Test-Path -LiteralPath $helper)){throw '缺少随包回收助手，未回收程序或用户资料。'}
  $temporary=Join-Path ([IO.Path]::GetTempPath()) ('optdsh-recycle-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $temporary|Out-Null
  Copy-Item -LiteralPath $helper -Destination (Join-Path $temporary 'recycle.ps1')
  # 目标为已验证的安装根/选中的日志根；其他Home和课题数据不传给回收器。
  $powershell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $pathsFile=Join-Path $temporary 'targets.json'
  [IO.File]::WriteAllText($pathsFile,(ConvertTo-Json -InputObject @($targets)),[Text.UTF8Encoding]::new($false))
  $runner=Join-Path $temporary 'run-recycle.ps1'
  [IO.File]::WriteAllText($runner,('param([string]$PathsFile)' + "`n" + '$decoded=Get-Content -LiteralPath $PathsFile -Raw -Encoding UTF8|ConvertFrom-Json' + "`n" + '$parameters=@{Mode=''DriveTrash'';Paths=[string[]]$decoded}' + "`n" + '& (Join-Path $PSScriptRoot ''recycle.ps1'') @parameters' + "`n" + 'if($LASTEXITCODE){exit $LASTEXITCODE}'),[Text.UTF8Encoding]::new($false))
  $output=& $powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -PathsFile $pathsFile 2>&1
  if($LASTEXITCODE -or('program'-in$selected -and(Test-Path -LiteralPath $target))){throw ('回收未完成，用户资料保留。'+($output-join "`n"))}
 }
 if($receipt.userPathRegistration -and 'program'-in$selected){
  $current=[Environment]::GetEnvironmentVariable('Path','User')
  $remaining=@($current-split ';'|Where-Object{$_-and$_.TrimEnd('\','/')-ne$target})
  [Environment]::SetEnvironmentVariable('Path',($remaining-join ';'),'User')
 }
 $result=@{status='completed';program=$target;programRemoved=('program'-in$selected);selected=$selected;removedPlugins=$removedPlugins;preserved=$dataPaths;recovery=($output-join "`n");sharedCanvasUnchanged=$true;globalAgentsUnchanged=$true}
 $auditDir=Join-Path $receipt.home '.runtime/uninstall';New-Item -ItemType Directory -Path $auditDir -Force|Out-Null
 $audit=Join-Path $auditDir ((Get-Date -Format 'yyyyMMdd-HHmmss')+'.json')
 [IO.File]::WriteAllText($audit,($result|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
 if($ConfirmUi){[System.Windows.Forms.MessageBox]::Show("程序已卸载。`n用户资料、课题和共享画板编辑器均保留。`n卸载回执：$audit",'卸载完成')|Out-Null}
 $result|ConvertTo-Json -Depth 6
}catch{
 if($ConfirmUi){[System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'卸载未完成','OK','Error')|Out-Null}
 else{Write-Error $_.Exception.Message}
 exit 1
}
