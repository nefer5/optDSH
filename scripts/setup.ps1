[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    if(-not(Test-Path '.venv/Scripts/python.exe')){py -3.12 -m venv .venv;if($LASTEXITCODE){throw 'Python 3.12 environment creation failed'}}
    & ./.venv/Scripts/python.exe -m pip install -r packages/optics/requirements.txt
    if($LASTEXITCODE){throw 'Python dependencies failed'}
    & ./.venv/Scripts/python.exe -m pip install -e packages/optics
    if($LASTEXITCODE){throw 'Local optical package failed'}
    npm ci --no-audit --no-fund
    if($LASTEXITCODE){throw 'Node dependencies failed'}
    if(-not(Test-Path 'config/optics.local.json')){Copy-Item -LiteralPath 'config/optics.example.json' -Destination 'config/optics.local.json'}
    Write-Output 'Setup complete. Open the root workbench or DSH launcher. Canvas editor remains the external N05 service.'
}finally{Pop-Location}
