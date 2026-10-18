# safe-delete: 安全删除
# 默认策略:
# - 少量删除: 发送到 Windows 回收站
# - 大批量删除: 移动到源盘根目录下的自定义垃圾箱
# 用法: pwsh recycle.ps1 <path1> [path2] [path3] ...

param(
    [ValidateSet("Auto", "RecycleBin", "DriveTrash")]
    [string]$Mode = "Auto",

    [string]$TrashFolderName = ".safe-delete-trash",

    [int]$BatchCountThreshold = 20,

    [long]$BatchBytesThreshold = 536870912,

    [Parameter(Mandatory=$true, Position=0, ValueFromRemainingArguments=$true)]
    [string[]]$Paths
)

function Get-UniqueDestinationPath {
    param(
        [Parameter(Mandatory=$true)]
        [string]$BaseDirectory,

        [Parameter(Mandatory=$true)]
        [string]$LeafName
    )

    $candidate = Join-Path $BaseDirectory $LeafName
    if (-not (Test-Path -LiteralPath $candidate)) {
        return $candidate
    }

    $stem = [System.IO.Path]::GetFileNameWithoutExtension($LeafName)
    $ext = [System.IO.Path]::GetExtension($LeafName)
    $index = 1

    while ($true) {
        $nextLeaf = "{0}_{1}{2}" -f $stem, $index, $ext
        $candidate = Join-Path $BaseDirectory $nextLeaf
        if (-not (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
        $index++
    }
}

function Get-ItemLogicalSize {
    param(
        [Parameter(Mandatory=$true)]
        [System.IO.FileSystemInfo]$Item
    )

    if (-not $Item.PSIsContainer) {
        return $Item.Length
    }

    $sum = (Get-ChildItem -LiteralPath $Item.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    if ($null -eq $sum) {
        return 0
    }

    return $sum
}

function Get-DriveTrashRoot {
    param(
        [Parameter(Mandatory=$true)]
        [string]$FullPath,

        [Parameter(Mandatory=$true)]
        [string]$TrashFolderName
    )

    $driveRoot = [System.IO.Path]::GetPathRoot($FullPath)
    if ([string]::IsNullOrWhiteSpace($driveRoot)) {
        throw "Unable to determine drive root for path: $FullPath"
    }

    return Join-Path $driveRoot $TrashFolderName
}

function Move-ToDriveTrash {
    param(
        [Parameter(Mandatory=$true)]
        [System.IO.FileSystemInfo]$Item,

        [Parameter(Mandatory=$true)]
        [string]$TrashFolderName,

        [Parameter(Mandatory=$true)]
        [string]$BatchStamp
    )

    $trashRoot = Get-DriveTrashRoot -FullPath $Item.FullName -TrashFolderName $TrashFolderName
    $batchDirectory = Join-Path $trashRoot $BatchStamp
    $kindDirectory = Join-Path $batchDirectory ($(if ($Item.PSIsContainer) { "dirs" } else { "files" }))

    if (-not (Test-Path -LiteralPath $kindDirectory)) {
        New-Item -ItemType Directory -Path $kindDirectory -Force -ErrorAction Stop | Out-Null
    }

    $destination = Get-UniqueDestinationPath -BaseDirectory $kindDirectory -LeafName $Item.Name
    Move-Item -LiteralPath $Item.FullName -Destination $destination -ErrorAction Stop

    return [PSCustomObject]@{
        TrashRoot = $trashRoot
        BatchDirectory = $batchDirectory
        Destination = $destination
    }
}

$existingItems = @()
$successCount = 0
$failCount = 0
$totalBytes = 0
$totalFileCount = 0
$manifestEntries = @()
$batchStamp = Get-Date -Format "yyyyMMdd-HHmmss"

foreach ($p in $Paths) {
    if (-not (Test-Path -LiteralPath $p)) {
        Write-Warning "Path not found, skipped: $p"
        $failCount++
        continue
    }

    $item = Get-Item -LiteralPath $p -Force
    $existingItems += $item
    $totalBytes += Get-ItemLogicalSize -Item $item

    if ($item.PSIsContainer) {
        $nestedFiles = @(Get-ChildItem -LiteralPath $item.FullName -Recurse -Force -File -ErrorAction SilentlyContinue)
        $totalFileCount += $nestedFiles.Count
    }
    else {
        $totalFileCount += 1
    }
}

if ($Mode -eq "Auto") {
    if ($totalFileCount -gt $BatchCountThreshold -or $totalBytes -gt $BatchBytesThreshold) {
        $Mode = "DriveTrash"
    }
    else {
        $Mode = "RecycleBin"
    }
}

if ($Mode -eq "RecycleBin") {
    try {
        Add-Type -AssemblyName Microsoft.VisualBasic
    }
    catch {
        Write-Error "Failed to load Microsoft.VisualBasic assembly (Windows only)"
        exit 1
    }
    Write-Host "Safe-delete mode: RecycleBin"
}
else {
    Write-Host "Safe-delete mode: DriveTrash"
    Write-Host "Trash folder name: $TrashFolderName"
}

Write-Host "Evaluated file count: $totalFileCount"
Write-Host ("Evaluated total size MB: " + [math]::Round($totalBytes / 1MB, 2))

foreach ($item in $existingItems) {
    $fullPath = $item.FullName

    try {
        if ($Mode -eq "DriveTrash") {
            $moveResult = Move-ToDriveTrash -Item $item -TrashFolderName $TrashFolderName -BatchStamp $batchStamp
            $movedItem = Get-Item -LiteralPath $moveResult.Destination -Force -ErrorAction Stop
            $manifestEntries += [PSCustomObject]@{
                OriginalPath = $fullPath
                TrashPath = $moveResult.Destination
                TrashRoot = $moveResult.TrashRoot
                ItemType = if ($item.PSIsContainer) { "Directory" } else { "File" }
                SizeBytes = Get-ItemLogicalSize -Item $movedItem
            }
            Write-Host "Trashed: $fullPath -> $($moveResult.Destination)"
        }
        else {
            if ($item.PSIsContainer) {
                [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
                    $fullPath,
                    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
                    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
                )
            }
            else {
                [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
                    $fullPath,
                    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
                    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
                )
            }
            Write-Host "Recycled: $fullPath"
        }

        $successCount++
    }
    catch {
        Write-Warning "Failed to process: $fullPath ($($_.Exception.Message))"
        $failCount++
    }
}

if ($Mode -eq "DriveTrash" -and $manifestEntries.Count -gt 0) {
    $manifestGroups = $manifestEntries | Group-Object {
        Split-Path -Parent $_.TrashPath | Split-Path -Parent
    }
    foreach ($group in $manifestGroups) {
        $manifestPath = Join-Path $group.Name "manifest.json"
        $group.Group | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
        Write-Host "Manifest: $manifestPath"
    }
}

Write-Host "`nDone: $successCount processed, $failCount failed"
if ($failCount -gt 0) { exit 1 }
