$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$state=Get-Content (Join-Path $root '.runtime/optics-access.json') -Raw | ConvertFrom-Json
$null=Invoke-RestMethod "$($state.url)/api/snapshot" -Headers @{Authorization="Bearer $($state.token)"} -TimeoutSec 3
Start-Process "$($state.url)/?token=$($state.token)"
Write-Output 'Opened authenticated optics inspector.'
