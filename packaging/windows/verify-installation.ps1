[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ReleaseRoot,
    [Parameter(Mandatory)][string]$ValidationRoot,
    [string[]]$Components = @('core'),
    [string]$NpmCacheRoot,
    [ValidateRange(0,65535)][int]$Port = 0,
    [ValidateRange(10,3600)][int]$InstallTimeoutSeconds = 600,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

function Normalize-Root([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.TrimEnd('\','/') -eq [IO.Path]::GetPathRoot($full).TrimEnd('\','/')) { throw 'Use a dedicated directory, not a filesystem root.' }
    return $full.TrimEnd('\','/')
}
function Test-Overlap([string]$A,[string]$B) {
    return $A.Equals($B,[StringComparison]::OrdinalIgnoreCase) -or $A.StartsWith($B+'\',[StringComparison]::OrdinalIgnoreCase) -or $B.StartsWith($A+'\',[StringComparison]::OrdinalIgnoreCase)
}
function Assert-PlainAncestors([string]$Path) {
    $cursor = $Path
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Validation/release paths must not traverse reparse points.' }
        }
        $parent = Split-Path $cursor -Parent
        if ($parent -eq $cursor) { break }; $cursor = $parent
    }
}
function Write-Receipt {
    $receipt.updatedAt = [DateTimeOffset]::Now.ToString('o')
    [IO.File]::WriteAllText($receiptPath,($receipt | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
}
# Kill only a timed-out wrapper's currently observed descendants, after checking
# both PID and creation time again. This never searches by port or executable name.
function Stop-ValidationTree($Wrapper) {
    $Wrapper.Refresh()
    if ($Wrapper.HasExited) { return }
    $identity = $Wrapper.StartTime.ToUniversalTime()
    $rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate)
    $owned = @([pscustomobject]@{ProcessId=$Wrapper.Id;StartedUtc=$identity})
    for ($round=0; $round -lt 32; $round++) {
        $ids = @($owned | ForEach-Object ProcessId)
        $next = @($rows | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids -and $_.CreationDate.ToUniversalTime() -ge $identity })
        if (-not $next.Count) { break }
        foreach ($row in $next) {
            $candidate = Get-Process -Id $row.ProcessId -ErrorAction SilentlyContinue
            $observed = Get-CimInstance Win32_Process -Filter "ProcessId=$($row.ProcessId)" -ErrorAction SilentlyContinue
            if ($candidate -and $observed -and $observed.ParentProcessId -eq $row.ParentProcessId -and $observed.CreationDate.ToUniversalTime() -eq $row.CreationDate.ToUniversalTime()) {
                $owned += [pscustomobject]@{ProcessId=$row.ProcessId;StartedUtc=$candidate.StartTime.ToUniversalTime()}
            }
        }
    }
    [array]::Reverse($owned)
    foreach ($row in $owned) {
        $current = Get-Process -Id $row.ProcessId -ErrorAction SilentlyContinue
        if ($current -and $current.StartTime.ToUniversalTime() -eq $row.StartedUtc) { $current.Kill() }
    }
}
function Invoke-ValidationProcess([string]$Script,[string[]]$Arguments,[string]$Step,[int]$Timeout) {
    $stdout = Join-Path $logRoot ($Step+'.stdout.log')
    $stderr = Join-Path $logRoot ($Step+'.stderr.log')
    $quoted = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$Script+'"'))
    foreach ($argument in $Arguments) {
        if ($argument.Contains('"') -or $argument.Contains("`r") -or $argument.Contains("`n")) { throw 'Unsupported process argument.' }
        $quoted += '"'+$argument+'"'
    }
    $child = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList $quoted -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    if (-not $child.WaitForExit($Timeout*1000)) {
        $receipt.processFailure = @{step=$Step;kind='timeout';timeoutSeconds=$Timeout}
        Stop-ValidationTree $child; throw "Step timeout: $Step; see private logs."
    }
    if ($child.ExitCode -ne 0) { $receipt.processFailure=@{step=$Step;kind='nonzero-exit';exitCode=$child.ExitCode}; throw "Step failed: $Step; see private logs." }
}

$sourceRoot = Normalize-Root (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
$ReleaseRoot = Normalize-Root $ReleaseRoot
$ValidationRoot = Normalize-Root $ValidationRoot
if ((Test-Overlap $ValidationRoot $sourceRoot) -or (Test-Overlap $ValidationRoot $ReleaseRoot)) { throw 'ValidationRoot must be independent of source and release directories.' }
Assert-PlainAncestors $ValidationRoot
Assert-PlainAncestors $ReleaseRoot
if (Test-Path -LiteralPath $ValidationRoot) { throw 'ValidationRoot already exists. Choose a new case; previous evidence was not changed.' }
$installer = Join-Path $ReleaseRoot 'packaging/windows/install.ps1'
$manifestPath = Join-Path $ReleaseRoot 'release-manifest.json'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf) -or -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Release installer or manifest is missing.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) { throw 'Unsupported release manifest.' }
$selected = @('core') + @($Components | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'core' } | Select-Object -Unique)
foreach ($id in $selected) {
    if ($id -notin @('core','workbench','canvas','forms') -or @($manifest.components | Where-Object id -eq $id).Count -ne 1) { throw "Unknown or duplicate release component: $id" }
}
if ($Port -ne 0 -and $Port -lt 1024) { throw 'Port must be zero (automatic) or 1024..65535.' }
$app = Join-Path $ValidationRoot 'app'; $caseHome = Join-Path $ValidationRoot 'home'; $workspace = Join-Path $ValidationRoot 'workspace'; $stateRoot = Join-Path $ValidationRoot 'state'; $logRoot = Join-Path $ValidationRoot 'private-logs'; $receiptPath = Join-Path $ValidationRoot 'verification-receipt.json'
$cacheRoot = if ($NpmCacheRoot) { Normalize-Root $NpmCacheRoot } else { Join-Path $ValidationRoot 'npm-cache' }
if ((Test-Overlap $cacheRoot $sourceRoot) -or (Test-Overlap $cacheRoot $ReleaseRoot)) { throw 'npm cache must be independent of source and release directories.' }
Assert-PlainAncestors $cacheRoot
$plan = [ordered]@{schemaVersion=1;releaseRoot=$ReleaseRoot;validationRoot=$ValidationRoot;installRoot=$app;home=$caseHome;workspace=$workspace;stateRoot=$stateRoot;components=$selected;port=$Port;installTimeoutSeconds=$InstallTimeoutSeconds;requiredNode='24.x';modelRequests=$false;zemax=$false;globalChanges=$false}
$plan.npmCacheRoot=$cacheRoot
$plan.cacheMode=if($NpmCacheRoot){'explicit-cache-reuse-not-a-cold-network-test'}else{'fresh-case-cache'}
if ($DryRun) { $plan | ConvertTo-Json -Depth 5; return }
New-Item -ItemType Directory -Path $ValidationRoot,$workspace,$logRoot -Force | Out-Null
$receipt = [ordered]@{schemaVersion=1;plan=$plan;status='running';phase='prerequisites';checks=@();clients=@();cleanup='not-started';limitations=@('No model calls, Zemax, browser interaction, sandbox or company validation.');updatedAt=$null}
$failed = $false
$savedEnvironment = @{}
try {
    Write-Receipt
    $nodeVersion = & node.exe -p 'process.versions.node'
    $receipt.nodeVersion = [string]$nodeVersion
    if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion -split '\.')[0] -ne 24) { throw 'Node.js 24.x is required; no runtime is bundled.' }
    if (-not $Port) {
        $reservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
        try { $reservation.Start(); $Port = $reservation.LocalEndpoint.Port } finally { $reservation.Stop() }
    }
    if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw 'Validation port is already occupied. No listener was changed.' }
    $plan.port = $Port
    # Isolate inherited developer settings; install and runtime still use the
    # user's Node and network environment, with bounded npm retries/downloads.
    foreach ($name in @('OPTDSH_HOME','OPTDSH_PROFILE','OPTDSH_WORKSPACE','OPTDSH_STATE_ROOT','OPTDSH_COMPONENTS','OPTDSH_PORT','DSH_HOME','npm_config_cache','npm_config_fetch_timeout','npm_config_fetch_retries','npm_config_fetch_retry_mintimeout','npm_config_fetch_retry_maxtimeout')) {
        $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
        $value = switch ($name) { 'npm_config_cache' {$cacheRoot} 'npm_config_fetch_timeout' {'60000'} 'npm_config_fetch_retries' {'1'} 'npm_config_fetch_retry_mintimeout' {'1000'} 'npm_config_fetch_retry_maxtimeout' {'5000'} default {$null} }
        [Environment]::SetEnvironmentVariable($name,$value,'Process')
    }
    $receipt.phase='install'; Write-Receipt
    Invoke-ValidationProcess $installer @('-ReleaseRoot',$ReleaseRoot,'-InstallRoot',$app,'-Home',$caseHome,'-Workspace',$workspace,'-Components',($selected -join ',')) 'install' $InstallTimeoutSeconds
    $receipt.checks += 'release-installer-completed'
    $receipt.phase='start'; Write-Receipt
    $runtime = Join-Path $app 'scripts/runtime'
    $launchArguments = @('-Home',$caseHome,'-Profile','web','-Workspace',$workspace,'-StateRoot',$stateRoot,'-Port',"$Port",'-Components',($selected -join ','))
    Invoke-ValidationProcess (Join-Path $runtime 'start-dsh.ps1') $launchArguments 'start' 120
    . (Join-Path $runtime 'launch-config.ps1')
    $context = Resolve-OptDshLaunch -InstallRoot $app -Home $caseHome -Profile web -Workspace $workspace -StateRoot $stateRoot -Port $Port -Components $selected
    $state = Get-Content -LiteralPath $context.StatePath -Raw | ConvertFrom-Json
    $authUrl = Get-OptDshAuthUrl $context $state
    $receipt.phase='authenticate'; Write-Receipt
    $index = Invoke-WebRequest -Uri $authUrl -SessionVariable caseSession -TimeoutSec 10 -UseBasicParsing
    if ($index.StatusCode -ne 200) { throw 'Authenticated index did not return HTTP 200.' }
    $baseUri = [uri]("http://127.0.0.1:$Port/")
    $receipt.checks += 'identity-and-authenticated-cookie'
    $receipt.phase='components'; Write-Receipt
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        $platform = Invoke-RestMethod -Uri ([uri]::new($baseUri,'api/optdsh-platform')) -WebSession $caseSession -TimeoutSec 5
        $missing = @(); foreach ($id in ($selected | Where-Object { $_ -ne 'core' })) { if (@($platform.components | Where-Object { $_.id -eq $id -and $_.status -eq 'ready' }).Count -ne 1) { $missing += $id } }
        $receipt.components = @(@{id='core';status=[string]$platform.core}) + @($platform.components | Where-Object { $_.id -in $selected } | ForEach-Object { @{id=$_.id;status=$_.status} })
        if ($platform.core -eq 'ready' -and -not $missing.Count) { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($platform.core -ne 'ready' -or $missing.Count) { throw 'Selected components were not ready before the deadline.' }
    $receipt.components = @(@{id='core';status='ready'}) + @($platform.components | Where-Object { $_.id -in $selected } | ForEach-Object { @{id=$_.id;status=$_.status} })
    $receipt.checks += 'selected-components-ready'
    $expectedClients = @(); if ('workbench' -in $selected) { $expectedClients += 'optdsh-workbench' }; if ('canvas' -in $selected) { $expectedClients += 'optdsh-agent-canvas' }
    if ($expectedClients.Count) {
        $receipt.phase='client-graph'; Write-Receipt
        $match = [regex]::Match($index.Content,'globalThis\["__DSH_BOOT__"\]\s*=\s*(\{[\s\S]*?\})\s*;?\s*</script>')
        if (-not $match.Success) { throw 'Official __DSH_BOOT__ graph is missing.' }
        $graph = $match.Groups[1].Value | ConvertFrom-Json
        foreach ($id in $expectedClients) {
            $rows = @($graph.entries | Where-Object id -eq $id)
            if ($rows.Count -ne 1) { throw "Client entry is missing or duplicated: $id" }
            $clientUri = [uri]::new($baseUri,[string]$rows[0].url)
            if ($clientUri.Scheme -ne $baseUri.Scheme -or $clientUri.Authority -ne $baseUri.Authority -or $clientUri.UserInfo -or $clientUri.Query -notmatch '(?:^\?|&)rev=[^&]+') { throw 'Client URL must be same-origin and revisioned.' }
            $client = Invoke-WebRequest -Uri $clientUri -WebSession $caseSession -TimeoutSec 10 -UseBasicParsing
            $clientCode = if ($client.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($client.Content) } else { [string]$client.Content }
            if ($client.StatusCode -ne 200 -or -not $clientCode.Contains($id)) { throw "Client script failed validation: $id" }
            $receipt.clients += @{id=$id;discoverable=$true;revisioned=$true;http=200;registration=$true}
        }
        $receipt.checks += 'official-client-graph-and-revisioned-scripts'
    }
    $receipt.phase='complete'; $receipt.status='passed'
} catch {
    $failed=$true; $receipt.status='failed'
    # Detailed install/server output stays in private logs. Authentication URLs,
    # cookie headers and raw web exceptions are never copied into the receipt.
    $receipt.failure = @{phase=$receipt.phase;exceptionType=$_.Exception.GetType().Name;message='Validation failed; inspect this case private logs.'}
    if ($receipt.phase -eq 'prerequisites' -and $receipt.nodeVersion -notmatch '^24\.') { $receipt.failure.message='Node.js 24.x is required; the detected or missing runtime was rejected.' }
    if ($receipt.processFailure.kind -eq 'timeout') { $receipt.failure.message="Step $($receipt.processFailure.step) timed out after $($receipt.processFailure.timeoutSeconds) seconds; inspect private logs." }
} finally {
    try {
        $runtime = Join-Path $app 'scripts/runtime'
        $statePath = Join-Path $stateRoot '.runtime/dsh-host.json'
        if ((Test-Path -LiteralPath $statePath) -and (Test-Path -LiteralPath (Join-Path $runtime 'launch-config.ps1'))) {
            . (Join-Path $runtime 'launch-config.ps1')
            $context = Resolve-OptDshLaunch -InstallRoot $app -Home $caseHome -Profile web -Workspace $workspace -StateRoot $stateRoot -Port $Port -Components $selected
            $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
            if (Get-Process -Id $state.pid -ErrorAction SilentlyContinue) {
                if (-not (Test-OptDshOwner $context $state)) { throw 'Cleanup refused: process identity mismatch.' }
                Invoke-ValidationProcess (Join-Path $runtime 'stop-dsh.ps1') @('-Home',$caseHome,'-Profile','web','-Workspace',$workspace,'-StateRoot',$stateRoot,'-Port',"$Port") 'stop' 30
                if (Test-OptDshOwner $context $state) { throw 'Cleanup did not stop the owned host.' }
            }
            $receipt.cleanup='owned-host-stopped-or-already-exited'
        } else { $receipt.cleanup='no-host-receipt' }
    } catch { $failed=$true; $receipt.status='failed'; $receipt.cleanup='failed-or-identity-refused'; $receipt.cleanupMessage='No unverified process was stopped; inspect case state and private logs.' }
    foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process') }
    Write-Receipt
}
if ($failed) { throw "Installation verification failed during $($receipt.phase). $($receipt.failure.message) Receipt: $receiptPath" }
Write-Output "Installation verification passed. Receipt: $receiptPath"
