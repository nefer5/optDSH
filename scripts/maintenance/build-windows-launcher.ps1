[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(-not(Test-Path -LiteralPath $compiler)){throw 'Windows .NET Framework C# compiler is unavailable; build on a prepared Windows machine.'}
$target=[IO.Path]::GetFullPath($OutputPath)
if(Test-Path -LiteralPath $target){throw 'Use a new output path; existing launcher was not overwritten.'}
New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force|Out-Null
& $compiler /nologo /target:exe /platform:anycpu /optimize+ /reference:System.Runtime.Serialization.dll "/out:$target" (Join-Path $root 'packages/optdsh-bundle/windows/Launcher.cs')
if($LASTEXITCODE){throw 'Launcher compilation failed.'}
Write-Output "Built thin launcher: $target"
