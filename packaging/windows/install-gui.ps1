[CmdletBinding()]
param([string]$ReleaseRoot=(Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
$ErrorActionPreference='Stop'
try {
 $node=Get-Command node.exe -ErrorAction Stop
 $version=& $node.Source -p 'process.versions.node'
 if($LASTEXITCODE -or [int]($version -split '\.')[0] -lt 24){throw '请先安装Node.js 24或更高版本，再重新打开安装向导。'}
 $server=Join-Path $ReleaseRoot 'installer/lib/installer-server.mjs'
 if(-not(Test-Path -LiteralPath $server)){throw '安装向导文件不完整，请重新解压完整发布包。'}
 & $node.Source $server $ReleaseRoot
 if($LASTEXITCODE){throw '安装向导未能启动，请查看发布目录logs中的诊断记录。'}
} catch {
 Add-Type -AssemblyName System.Windows.Forms
 [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'optDSH安装向导','OK','Error')|Out-Null
 exit 1
}
