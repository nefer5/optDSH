[CmdletBinding()]
param([ValidateRange(1024, 65535)][int]$Port = 3080, [switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$entry = Join-Path $projectRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js'
if (-not (Test-Path -LiteralPath $entry)) { throw 'DSH is not installed. Run npm ci in the project root.' }
$runtimeDir = Join-Path $projectRoot '.runtime'
$statePath = Join-Path $runtimeDir 'dsh-host.json'
$logDir = Join-Path $projectRoot 'logs/dsh'
New-Item -ItemType Directory -Path $runtimeDir, $logDir -Force | Out-Null
if (Test-Path -LiteralPath $statePath) {
    $previous = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $existing = Get-Process -Id $previous.pid -ErrorAction SilentlyContinue
    if ($existing -and $existing.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$previous.startedUtc).UtcDateTime) {
        if ([int]$previous.port -ne $Port) { throw "Managed DSH uses port $($previous.port); use open-dsh.ps1 or stop it before changing ports." }
        $existingCommand = (Get-CimInstance Win32_Process -Filter "ProcessId=$($previous.pid)").CommandLine
        if (-not $existingCommand.Contains($entry)) { throw 'Recorded process does not match this project; no process changed.' }
        Write-Output "DSH Web is already running: $($previous.url) (PID $($previous.pid))"
        if ($OpenBrowser) { & (Join-Path $PSScriptRoot 'open-dsh.ps1') }
        return
    }
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "Port $Port is already occupied. Use scripts/status-dsh.ps1; no existing process was modified."
}
# Keep generated native experts aligned with their tracked source before boot.
$expertDistributor = Join-Path $projectRoot '.agents/development-skills/expert-distribute/scripts/distribute.py'
& (Join-Path $projectRoot '.venv/Scripts/python.exe') $expertDistributor --only dsh --apply | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'DSH expert distribution failed; run expert-distribute --only dsh to inspect conflicts.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$overrides = @{
    DSH_HOME = (Join-Path $projectRoot 'data/dsh')
    DSH_TELEMETRY_MODE = 'DISABLED'
}
$saved = @{}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stdout = Join-Path $logDir "$stamp.stdout.log"
$stderr = Join-Path $logDir "$stamp.stderr.log"
try {
    foreach ($name in $overrides.Keys) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $overrides[$name], 'Process')
    }
    $policy = Join-Path $projectRoot 'config/dsh.local-policy.yml'
    $expertPatch = Join-Path $projectRoot '.agents/dsh-presets/visual-designer/agent.cordis.yml'
    $arguments = @(('"' + $entry + '"'), '--profile', 'web', '--patch', ('"' + $policy + '"'), '--patch', ('"' + $expertPatch + '"'), '--host', '127.0.0.1', '--port', "$Port", '--no-open')
    $child = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
$state = @{
    pid = $child.Id
    startedUtc = $child.StartTime.ToUniversalTime().ToString('o')
    entry = $entry
    port = $Port
    url = "http://127.0.0.1:$Port"
    stdout = $stdout
    stderr = $stderr
}
[IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$ready = $false
$launchUrl = $null
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $child.Refresh()
    if ($child.HasExited) { throw "DSH exited with code $($child.ExitCode). See $stderr" }
    try {
        $launchState=Get-Content (Join-Path $runtimeDir 'web-launch.json') -Raw | ConvertFrom-Json
        if($launchState.pid -ne $child.Id){Start-Sleep -Milliseconds 500; continue}
        $launchUrl=$launchState.authenticatedUrl
        $response = Invoke-WebRequest -Uri $launchUrl -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw "DSH is still starting. PID $($child.Id); inspect $stderr and use scripts/status-dsh.ps1." }
Write-Output "DSH Web: $($state.url) (PID $($child.Id))"
Write-Output "Runtime data: $($overrides.DSH_HOME)"
if ($OpenBrowser) { Start-Process $launchUrl }
