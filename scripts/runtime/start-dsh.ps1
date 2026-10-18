[CmdletBinding()]
param([int]$Port, [Alias('Home')][string]$DshHome, [Alias('Profile')][string]$DshProfile, [string]$Workspace, [string]$StateRoot, [string[]]$Components, [string]$Config, [switch]$OpenBrowser, [switch]$Restart)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launch-config.ps1')
$context = Resolve-OptDshLaunch -Home $DshHome -Profile $DshProfile -Workspace $Workspace -StateRoot $StateRoot -Components $Components -Config $Config -Port $Port
if (-not (Test-Path -LiteralPath $context.Entry -PathType Leaf)) { throw 'DSH is not installed. Run the platform setup first.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = & $node -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion -split '\.')[0] -ne 24) { throw 'Node.js 24.x must be installed by the user.' }
New-Item -ItemType Directory -Path $context.RuntimeDir, $context.LogDir, $context.LeaseRoot -Force | Out-Null
# The profile lease is independent of StateRoot, preventing two custom state
# directories from becoming concurrent writers to the same official profile.
$profileLock = [IO.File]::Open((Join-Path $context.LeaseRoot 'launch.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
$leasePath = Join-Path $context.LeaseRoot 'host.json'
$lock = $null
# A per-state launcher lock prevents concurrent starts; retain its empty file.
try {
    $lock = [IO.File]::Open((Join-Path $context.RuntimeDir 'launch.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    if (Test-Path -LiteralPath $leasePath) {
        $lease = Get-Content -LiteralPath $leasePath -Raw | ConvertFrom-Json
        $leaseProcess = Get-Process -Id $lease.pid -ErrorAction SilentlyContinue
        if ($leaseProcess -and $leaseProcess.StartTime.ToUniversalTime() -eq ([DateTimeOffset]$lease.startedUtc).UtcDateTime -and $lease.stateRoot -ne $context.StateRoot) { throw 'This home/profile already has a live host in a different state root. No process changed.' }
    }
    $state = $null
    if (Test-Path -LiteralPath $context.StatePath) {
        try { $state = Get-Content -LiteralPath $context.StatePath -Raw | ConvertFrom-Json }
        catch { throw 'Host record is unreadable; preserve it and inspect status before starting.' }
    }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $context.Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($listeners.Count) {
        if ($listeners.Count -ne 1 -or -not (Test-OptDshOwner $context $state) -or $listeners[0] -ne $state.pid) { throw "Port $($context.Port) is occupied by an unverified process. No process changed; use status-dsh.ps1 with the same launch parameters." }
        if (-not $Restart) {
            if (($context.Components -join ',') -ne (@($state.components) -join ',')) { throw 'Component selection changed. Finish active work, then explicitly restart this host.' }
            $authUrl = Get-OptDshAuthUrl $context $state
            Write-Output "DSH Web is already running: $($state.url) (PID $($state.pid))"
            if ($OpenBrowser) { Start-Process $authUrl }
            return
        }
        if (-not (Test-OptDshOwner $context $state)) { throw 'Host identity changed; refusing restart.' }
        Stop-Process -Id $state.pid -ErrorAction Stop
        Wait-Process -Id $state.pid -Timeout 10 -ErrorAction SilentlyContinue
        # Windows can briefly report the exiting listener after process death.
        $releaseDeadline = [DateTime]::UtcNow.AddSeconds(5)
        do {
            $remaining = @(Get-NetTCPConnection -State Listen -LocalPort $context.Port -ErrorAction SilentlyContinue)
            if ($remaining.Count) { Start-Sleep -Milliseconds 200 }
        } while ($remaining.Count -and [DateTime]::UtcNow -lt $releaseDeadline)
        if ($remaining.Count) { throw 'Port is still occupied; no further process changed.' }
    } elseif ($state -and (Get-Process -Id $state.pid -ErrorAction SilentlyContinue)) {
        throw 'Recorded PID is still alive without the expected listener. Inspect status; refusing to start a competing writer.'
    }
    $bundleCli = Join-Path $context.InstallRoot 'packages/optdsh-bundle/lib/cli.mjs'
    if (-not (Test-Path -LiteralPath $bundleCli)) { $bundleCli = Join-Path $context.InstallRoot 'node_modules/optdsh-bundle/lib/cli.mjs' }
    if (-not (Test-Path -LiteralPath $bundleCli)) { throw 'Product bundle composer is missing from the installation.' }
    $compose = & $node $bundleCli compose --install-root $context.InstallRoot --home $context.Home --profile $context.Profile --workspace $context.Workspace --state-root $context.StateRoot --components ($context.Components -join ',') --output $context.PatchPath
    if ($LASTEXITCODE -ne 0) { throw 'Product bundle composition failed; no host was started.' }
    $receipt = $compose | ConvertFrom-Json
    if (-not $receipt.patchPath -or [IO.Path]::GetFullPath($receipt.patchPath) -ne $context.PatchPath -or -not (Test-Path -LiteralPath $context.PatchPath -PathType Leaf)) { throw 'Bundle composer returned an invalid patch path.' }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $stdout = Join-Path $context.LogDir "$stamp.stdout.log"
    $stderr = Join-Path $context.LogDir "$stamp.stderr.log"
    $overrides = @{ DSH_HOME=$context.Home; DSH_TELEMETRY_MODE='DISABLED'; OPTDSH_WORKSPACE=$context.Workspace; OPTDSH_STATE_ROOT=$context.StateRoot }
    $saved = @{}
    try {
        foreach ($name in $overrides.Keys) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process'); [Environment]::SetEnvironmentVariable($name, $overrides[$name], 'Process') }
        $arguments = @(('"' + $context.Entry + '"'), '--profile', $context.Profile)
        if ($context.Profile -ne 'web' -and -not (Test-Path -LiteralPath (Join-Path $context.ProfileRoot 'package.json'))) {
            if (Test-Path -LiteralPath $context.ProfileRoot) { throw 'Custom profile directory exists without a manifest. Preserve it and choose a new profile name.' }
            $arguments += @('--from-default-profile', 'web')
        }
        $arguments += @('--patch', ('"' + $context.PatchPath + '"'), '--host', '127.0.0.1', '--port', "$($context.Port)", '--no-open')
        $child = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $context.Workspace -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    } finally {
        foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    }
    $state = [ordered]@{ schemaVersion=1; pid=$child.Id; startedUtc=$child.StartTime.ToUniversalTime().ToString('o'); entry=$context.Entry; home=$context.Home; profile=$context.Profile; workspace=$context.Workspace; stateRoot=$context.StateRoot; port=$context.Port; url="http://127.0.0.1:$($context.Port)"; stdout=$stdout; stderr=$stderr; components=$context.Components }
    [IO.File]::WriteAllText($context.StatePath, ($state | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($leasePath, ($state | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $state = [pscustomobject]$state
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $child.Refresh()
        if ($child.HasExited) { throw "DSH exited with code $($child.ExitCode). See $stderr" }
        try { $authUrl = Get-OptDshAuthUrl $context $state; $ready = $true; break } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw "DSH has not passed readiness. PID $($child.Id); inspect $stderr. No other process was stopped." }
    Write-Output "DSH Web: $($state.url) (PID $($child.Id))"
    Write-Output "User home: $($context.Home); workspace: $($context.Workspace)"
    if ($OpenBrowser) { Start-Process $authUrl }
} finally { if ($lock) { $lock.Dispose() }; $profileLock.Dispose() }
