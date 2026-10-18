[CmdletBinding()]
param([Parameter(Mandatory)][string]$Wheel,[Parameter(Mandatory)][string]$EnvironmentRoot,[string]$Python='py',[string]$Requirements=(Join-Path $PSScriptRoot 'optics-requirements.txt'),[switch]$DryRun)
$ErrorActionPreference='Stop'
$Wheel=[IO.Path]::GetFullPath($Wheel)
$EnvironmentRoot=[IO.Path]::GetFullPath($EnvironmentRoot)
if (-not (Test-Path -LiteralPath $Wheel -PathType Leaf)) { throw 'Provide the release optical wheel' }
if (-not (Test-Path -LiteralPath $Requirements -PathType Leaf)) { throw 'Missing locked dependency requirements' }
$manifestPath=Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'release-manifest.json'
if (Test-Path -LiteralPath $manifestPath) {
 $release=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
 if (-not $release.optics -or (Get-FileHash -LiteralPath $Wheel -Algorithm SHA256).Hash -ne $release.optics.sha256) { throw 'Optical wheel does not match release manifest' }
}
if ($EnvironmentRoot.TrimEnd('\','/') -eq [IO.Path]::GetPathRoot($EnvironmentRoot).TrimEnd('\','/')) { throw 'Environment root must not be a drive root' }
if ($DryRun) { Write-Output "Would create Python environment: $EnvironmentRoot; install locked dependencies and $Wheel. Zemax is not bundled.";return }
if (Test-Path -LiteralPath $EnvironmentRoot) { throw 'Use a new optical environment directory; existing environment preserved' }
if ([IO.Path]::GetFileNameWithoutExtension($Python) -eq 'py') { & $Python -3.12 -m venv $EnvironmentRoot } else { & $Python -m venv $EnvironmentRoot }
if ($LASTEXITCODE) { throw 'Python environment creation failed' }
$exe=Join-Path $EnvironmentRoot 'Scripts/python.exe'
& $exe -m pip install -r $Requirements
if ($LASTEXITCODE) { throw 'Optical dependency installation failed' }
& $exe -m pip install $Wheel
if ($LASTEXITCODE) { throw 'Optical wheel installation failed' }
Write-Output "Optical package installed. Use -Python $exe when starting the optical service. Actual Zemax connection and business validation remain separate."
