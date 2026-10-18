# Shared path and ownership contract; dot-source without creating directories.
function Resolve-OptDshLaunch {
    param([string]$InstallRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent), [Alias('Home')][string]$DshHome, [Alias('Profile')][string]$DshProfile, [string]$Workspace, [string]$StateRoot, [string[]]$Components, [string]$Config, [int]$Port)
    function FullPath([string]$Value, [string]$Base) {
        if ($Value -eq '~') { $Value = [Environment]::GetFolderPath('UserProfile') }
        elseif ($Value.StartsWith('~/') -or $Value.StartsWith('~\')) { $Value = Join-Path ([Environment]::GetFolderPath('UserProfile')) $Value.Substring(2) }
        if (-not [IO.Path]::IsPathRooted($Value)) { $Value = Join-Path $Base $Value }
        return [IO.Path]::GetFullPath($Value)
    }
    $base = (Get-Location).ProviderPath
    $InstallRoot = FullPath $InstallRoot $base
    $initialHome = if ($DshHome) { $DshHome } elseif ($env:OPTDSH_HOME) { $env:OPTDSH_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.optdsh' }
    $initialHome = FullPath $initialHome $base
    $configPath = if ($Config) { FullPath $Config $base } else { Join-Path $initialHome 'config/runtime.json' }
    $settings = @{}
    if (Test-Path -LiteralPath $configPath) {
        $settings = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($settings -isnot [pscustomobject]) { throw 'Launch configuration must be a JSON object.' }
        $dictionary = @{}
        foreach ($property in $settings.PSObject.Properties) { $dictionary[$property.Name] = $property.Value }
        $settings = $dictionary
        if ($settings -isnot [System.Collections.IDictionary]) { throw 'Launch configuration must be a JSON object.' }
    }
    elseif ($Config) { throw "Launch configuration not found: $configPath" }
    $configBase = Split-Path $configPath -Parent
    $resolvedHome = if ($DshHome) { FullPath $DshHome $base } elseif ($env:OPTDSH_HOME) { FullPath $env:OPTDSH_HOME $base } elseif ($settings.home) { FullPath $settings.home $configBase } else { $initialHome }
    $resolvedProfile = if ($DshProfile) { $DshProfile } elseif ($env:OPTDSH_PROFILE) { $env:OPTDSH_PROFILE } elseif ($settings.profile) { $settings.profile } else { 'web' }
    if ($resolvedProfile -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$' -or $resolvedProfile -in @('desktop','acp','headless','sdk','sdk-minimal')) { throw 'Invalid Web profile name; use web or a custom plain directory name.' }
    $resolvedWorkspace = if ($Workspace) { FullPath $Workspace $base } elseif ($env:OPTDSH_WORKSPACE) { FullPath $env:OPTDSH_WORKSPACE $base } elseif ($settings.workspace) { FullPath $settings.workspace $configBase } else { $base }
    if (-not (Test-Path -LiteralPath $resolvedWorkspace -PathType Container)) { throw "Workspace directory not found: $resolvedWorkspace" }
    $resolvedState = if ($StateRoot) { FullPath $StateRoot $base } elseif ($env:OPTDSH_STATE_ROOT) { FullPath $env:OPTDSH_STATE_ROOT $base } elseif ($settings.stateRoot) { FullPath $settings.stateRoot $configBase } else { Join-Path $resolvedHome "state/$resolvedProfile" }
    $selected = if ($Components) { $Components } elseif ($env:OPTDSH_COMPONENTS) { $env:OPTDSH_COMPONENTS } elseif ($settings.components) { $settings.components } else { @('core') }
    $selected = @($selected | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
    if (-not $selected.Count -or @($selected | Where-Object { $_ -notmatch '^[a-z][a-z0-9-]*$' }).Count) { throw 'Invalid component selection.' }
    $resolvedPort = if ($Port) { $Port } elseif ($env:OPTDSH_PORT) { [int]$env:OPTDSH_PORT } elseif ($settings.port) { [int]$settings.port } else { 3080 }
    if ($resolvedPort -lt 1024 -or $resolvedPort -gt 65535) { throw 'Port must be between 1024 and 65535.' }
    if ($resolvedState -eq $InstallRoot -or $resolvedHome -eq $InstallRoot) { throw 'Home/state cannot equal the installation root.' }
    foreach ($root in @($resolvedHome,$resolvedState)) { if ($root.TrimEnd([IO.Path]::DirectorySeparatorChar) -eq [IO.Path]::GetPathRoot($root).TrimEnd([IO.Path]::DirectorySeparatorChar)) { throw 'Home/state must be dedicated directories, not a filesystem root.' } }
    [pscustomobject]@{ InstallRoot=$InstallRoot; Home=$resolvedHome; Profile=$resolvedProfile; ProfileRoot=(Join-Path $resolvedHome "profiles/$resolvedProfile"); LeaseRoot=(Join-Path $resolvedHome ".runtime/profiles/$resolvedProfile"); Workspace=$resolvedWorkspace; StateRoot=$resolvedState; Components=$selected; Port=$resolvedPort; RuntimeDir=(Join-Path $resolvedState '.runtime'); StatePath=(Join-Path $resolvedState '.runtime/dsh-host.json'); LaunchPath=(Join-Path $resolvedState '.runtime/web-launch.json'); PatchPath=(Join-Path $resolvedState 'bundle.patch.yml'); LogDir=(Join-Path $resolvedState 'logs/dsh'); Entry=(Join-Path $InstallRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js') }
}

function Test-OptDshOwner($Context, $State) {
    if (-not $State -or $State.schemaVersion -ne 1) { return $false }
    foreach ($key in @('Home','Profile','Workspace','StateRoot','Entry','Port')) { if ([string]$State.$key -ne [string]$Context.$key) { return $false } }
    try {
        $process = Get-Process -Id $State.pid -ErrorAction Stop
        if ($process.StartTime.ToUniversalTime() -ne ([DateTimeOffset]$State.startedUtc).UtcDateTime) { return $false }
        $command = (Get-CimInstance Win32_Process -Filter "ProcessId=$($State.pid)" -ErrorAction Stop).CommandLine
        if ($command -notmatch '^(?:"[^"\r\n]*[\\/]node(?:\.exe)?"|(?:[^\s"]*[\\/])?node(?:\.exe)?)\s+') { return $false }
        foreach ($token in @($Context.Entry, $Context.PatchPath)) { if ($command -notmatch ('(?:^|[\s"])' + [regex]::Escape($token) + '(?:"|\s|$)')) { return $false } }
        if ($command -notmatch ('--profile\s+"?' + [regex]::Escape($Context.Profile) + '(?:"|\s|$)') -or $command -notmatch ('--port\s+' + $Context.Port + '(?:\s|$)')) { return $false }
        return $true
    } catch { return $false }
}

function Get-OptDshAuthUrl($Context, $State) {
    if (-not (Test-OptDshOwner $Context $State)) { throw 'Host identity does not match the selected home/profile/workspace.' }
    $launch = Get-Content -LiteralPath $Context.LaunchPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $uri = [uri]$launch.authenticatedUrl
    if ($launch.pid -ne $State.pid -or $uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or $uri.Port -ne $Context.Port -or $uri.UserInfo -or $uri.AbsolutePath -ne '/') { throw 'Invalid authenticated launch record.' }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Context.Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($listeners.Count -ne 1 -or $listeners[0] -ne $State.pid) { throw 'Listener ownership mismatch.' }
    if ((Invoke-WebRequest -Uri $uri -TimeoutSec 3 -UseBasicParsing).StatusCode -ne 200) { throw 'Authentication failed.' }
    return $uri.AbsoluteUri
}
