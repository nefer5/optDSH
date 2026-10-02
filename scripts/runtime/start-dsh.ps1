[CmdletBinding()]
param([ValidateRange(1024, 65535)][int]$Port = 3080, [switch]$OpenBrowser, [switch]$Restart)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$entry = Join-Path $projectRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js'
if (-not (Test-Path -LiteralPath $entry)) { throw 'DSH is not installed. Run npm ci in the project root.' }
$runtimeDir = Join-Path $projectRoot '.runtime'
$statePath = Join-Path $runtimeDir 'dsh-host.json'
$logDir = Join-Path $projectRoot 'logs/dsh'
New-Item -ItemType Directory -Path $runtimeDir, $logDir -Force | Out-Null
$previous = $null
if (Test-Path -LiteralPath $statePath) {
    try { $previous = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
    catch { Write-Warning 'DSH PID record is unreadable; checking the actual listener.' }
}
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
if ($listeners.Count) {
    $hostProcess = $null
    foreach ($listenerId in $listeners) {
        $details = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerId"
        # Show executable, never command-line arguments which may contain credentials.
        Write-Output "Port $Port listener: PID $listenerId; executable $($details.ExecutablePath)"
        $command = $details.CommandLine
        $escapedEntry = [regex]::Escape($entry)
        $escapedPolicy = [regex]::Escape((Join-Path $projectRoot 'config/dsh.local-policy.yml'))
        if ($listeners.Count -ne 1 -or -not $command -or
            $command -notmatch ('(?:^|[\s"])' + $escapedEntry + '(?:"|\s|$)') -or
            $command -notmatch ('--patch\s+"?' + $escapedPolicy + '(?:"|\s|$)') -or
            $command -notmatch ('--port\s+' + $Port + '(?:\s|$)') -or
            $command -notmatch '--profile\s+web(?:\s|$)') {
            throw "Port $Port belongs to an unverified process. No process changed. Run: pwsh -File scripts/runtime/status-dsh.ps1"
        }
        $hostProcess = Get-Process -Id $listenerId -ErrorAction Stop
        $hostStartedUtc = $hostProcess.StartTime.ToUniversalTime()
    }
    $launch = $null
    try {
        $launch = Get-Content (Join-Path $runtimeDir 'web-launch.json') -Raw | ConvertFrom-Json
        $authUri = [uri]$launch.authenticatedUrl
        if ($launch.pid -ne $hostProcess.Id -or $authUri.Scheme -ne 'http' -or
            $authUri.Host -ne '127.0.0.1' -or $authUri.Port -ne $Port) { throw 'Stale launch record' }
        if ((Invoke-WebRequest -Uri $authUri -TimeoutSec 5 -UseBasicParsing).StatusCode -ne 200) { throw 'Authentication failed' }
    } catch { $launch = $null }
    if (-not $Restart) {
        if (-not $launch) {
            throw "Project DSH PID $($hostProcess.Id) has no valid authentication entry. After running tasks finish, restart with: .\启动DSH.cmd -Restart"
        }
        $state = @{ pid=$hostProcess.Id; startedUtc=$hostProcess.StartTime.ToUniversalTime().ToString('o'); entry=$entry; port=$Port; url="http://127.0.0.1:$Port" }
        if ($previous -and $previous.pid -eq $hostProcess.Id -and
            ([DateTimeOffset]$previous.startedUtc).UtcDateTime -eq $hostStartedUtc) {
            foreach ($key in @('stdout','stderr')) { $state[$key] = $previous.$key }
        } else { Write-Output 'Recovered stale DSH PID record from the verified listener and authentication entry.' }
        [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        Write-Output "DSH Web is already running: $($state.url) (PID $($state.pid))"
        if ($OpenBrowser) { Start-Process $launch.authenticatedUrl }
        return
    }
    # Explicit -Restart authorizes stopping this identity-checked project host.
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($hostProcess.Id)"
    $hostProcess.Refresh()
    if (-not $current -or $current.CommandLine -ne $command -or
        $hostProcess.StartTime.ToUniversalTime() -ne $hostStartedUtc) { throw 'Process identity changed; refusing restart.' }
    Stop-Process -Id $hostProcess.Id -ErrorAction Stop
    Wait-Process -Id $hostProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
    if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw "Port $Port is still occupied; no further process changed." }
}
# Keep generated native experts aligned with their tracked source before boot.
$expertDistributor = Join-Path $projectRoot '.agents/development-skills/expert-distribute/scripts/distribute.py'
& (Join-Path $projectRoot '.venv/Scripts/python.exe') $expertDistributor --expert all --only dsh --apply | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'DSH expert distribution failed; run expert-distribute --expert all --only dsh to inspect conflicts.' }
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
    # One generated preset patch per distributed expert, in stable name order.
    $expertPatches = @(Get-ChildItem -Path (Join-Path $projectRoot '.agents/dsh-presets') -Directory | Sort-Object Name | ForEach-Object { Join-Path $_.FullName 'agent.cordis.yml' } | Where-Object { Test-Path -LiteralPath $_ })
    $arguments = @(('"' + $entry + '"'), '--profile', 'web', '--patch', ('"' + $policy + '"'))
    foreach ($patch in $expertPatches) { $arguments += @('--patch', ('"' + $patch + '"')) }
    $arguments += @('--host', '127.0.0.1', '--port', "$Port", '--no-open')
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
if (-not $ready) { throw "DSH is still starting. PID $($child.Id); inspect $stderr and use scripts/runtime/status-dsh.ps1." }
Write-Output "DSH Web: $($state.url) (PID $($child.Id))"
Write-Output "Runtime data: $($overrides.DSH_HOME)"
if ($OpenBrowser) { Start-Process $launchUrl }
