[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$target=[IO.Path]::GetFullPath($OutputPath)
if(Test-Path -LiteralPath $target){throw 'Use a new installer launcher output path'}
New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force|Out-Null
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /reference:System.Windows.Forms.dll "/out:$target" (Join-Path $root 'packages/optdsh-bundle/windows/InstallerLauncher.cs')
if($LASTEXITCODE){throw 'Installer launcher compilation failed'}
