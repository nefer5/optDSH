[CmdletBinding()]
param([switch]$WithOptics, [string]$Python = 'py', [string]$PythonVersion = '3.12')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$node = Get-Command node.exe -ErrorAction Stop
$version = & $node.Source -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [int]($version -split '\.')[0] -lt 24) { throw 'Install Node.js 24 or newer before running platform setup.' }
Push-Location $root
try {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE) { throw 'Node dependency installation failed.' }
    if ($WithOptics) {
        $venvPython = Join-Path $root '.venv/Scripts/python.exe'
        if (-not (Test-Path -LiteralPath $venvPython)) {
            if ([IO.Path]::GetFileNameWithoutExtension($Python) -eq 'py') { & $Python "-$PythonVersion" -m venv .venv }
            else { & $Python -m venv .venv }
            if ($LASTEXITCODE) { throw 'Optional optical Python environment creation failed.' }
        }
        & $venvPython -m pip install -r packages/optics/requirements.txt
        if ($LASTEXITCODE) { throw 'Optional optical dependency installation failed.' }
        & $venvPython -m pip install -e packages/optics
        if ($LASTEXITCODE) { throw 'Optional optical package installation failed.' }
        if (-not (Test-Path -LiteralPath 'config/optics.local.json')) { Copy-Item -LiteralPath 'config/optics.example.json' -Destination 'config/optics.local.json' }
    }
    Write-Output 'Platform setup complete. Node.js is user-provided; Python/Zemax and independent Canvas are optional, separately installed components.'
} finally { Pop-Location }
