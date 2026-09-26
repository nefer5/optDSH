$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$path=Join-Path $root '.runtime/optics-process.json'
if(-not(Test-Path -LiteralPath $path)){Write-Output 'No managed optics bridge recorded.';return}
$state=Get-Content $path -Raw | ConvertFrom-Json
$proc=Get-Process -Id $state.pid -ErrorAction SilentlyContinue
$owned=$proc -and $proc.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$state.startedUtc).UtcDateTime
if(-not $owned){Write-Output 'Recorded optics bridge is not running.';return}
$access=Get-Content (Join-Path $root '.runtime/optics-access.json') -Raw | ConvertFrom-Json
$v=Invoke-RestMethod "$($access.url)/api/snapshot" -Headers @{Authorization="Bearer $($access.token)"} -TimeoutSec 3
[pscustomobject]@{PID=$state.pid;URL=$access.url;Backend=$v.backend;Busy=$v.busy;Objects=$v.snapshot.objectCount;Revision=$v.snapshot.revision;CapturedAt=$v.snapshot.capturedAt;ErrorCode=$v.error.code;ReadOnly=$v.readOnly}
