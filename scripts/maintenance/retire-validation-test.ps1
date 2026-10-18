[CmdletBinding()]
param([Parameter(Mandatory)][string]$Root)
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$boundary=[IO.Path]::GetFullPath((Join-Path (Split-Path $repo -Parent) 'Proj-2026-N06_optDSH-validation/临时测试')).TrimEnd('\')+'\'
$target=[IO.Path]::GetFullPath($Root).TrimEnd('\')
if(-not $target.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)){throw '拒绝回收临时测试范围外的目录。'}
$markerPath=Join-Path $target 'synthetic-fixture.json'
if(-not(Test-Path -LiteralPath $markerPath)){throw '缺少本批次合成夹具标记。'}
$marker=Get-Content -LiteralPath $markerPath -Raw|ConvertFrom-Json
if(-not $marker.synthetic){throw '该目录没有声明为合成测试夹具。'}
if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '夹具根不能是重解析链接。'}
# 先逐项回收链接对象，再回收普通父目录；不递归移动链接树。
$links=@(Get-ChildItem -LiteralPath $target -Recurse -Force -Attributes ReparsePoint|ForEach-Object FullName)
& (Join-Path $repo 'packaging/windows/recycle.ps1') -Mode DriveTrash -Paths ([string[]]($links+@($target)))
if($LASTEXITCODE){exit $LASTEXITCODE}
