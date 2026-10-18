# 仅允许读取已开启的 Extension；无保存、设置参数、追迹或关闭用户应用调用。
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
function Fail([string]$code,[string]$message) { throw ($code+'|'+$message) }
function Read-Pass($system,$fields) {
    if ([string]$system.Mode -ne 'NonSequential') { Fail 'UNSUPPORTED_MODE' '仅支持纯非序列模型' }
    if ([string]$system.SystemData.Units.LensUnits -ne 'Millimeters') { Fail 'UNSUPPORTED_UNITS' '仅支持毫米单位' }
    if ($null -ne $system.Tools.CurrentTool) { Fail 'HOST_BUSY' 'Zemax 工具正在运行' }
    $nce=$system.NCE
    $count=[int]$nce.NumberOfObjects
    if ($count -lt 1 -or $count -gt 5000) { Fail 'UNSUPPORTED_SIZE' '对象数必须在 1 至 5000 之间' }
    $rows=@()
    for ($i=1;$i -le $count;$i++) {
        $o=$nce.GetObjectAt($i)
        $matrixArgs=New-Object 'object[]' 13
        $matrixArgs[0]=[int]$i
        for ($j=1;$j -le 12;$j++) { $matrixArgs[$j]=[double]0 }
        $matrixMethod=@($nce.GetType().GetInterfaces() | ForEach-Object { $_.GetMethods() } | Where-Object { $_.Name -eq 'GetMatrix' -and $_.GetParameters().Count -eq 13 })[0]
        $ok=$matrixMethod.Invoke($nce,$matrixArgs)
        $numbers=@($matrixArgs[1..12])
        $values=@{}; $errors=@(); $hidden=$null
        $names=$fields.PSObject.Properties[[string]$o.TypeName].Value
        if ($names) {
            $data=$o.ObjectData; $props=@{}
            foreach ($interface in $data.GetType().GetInterfaces()) {
                foreach ($property in $interface.GetProperties()) { $props[$property.Name]=$property }
            }
            foreach ($name in $names) {
                if ([string]$o.TypeName -eq 'Compound Lens') {
                    if ($values.IsRectangle -eq 1 -and $name -in @('FrontEdgeRadius','RearEdgeRadius')) { continue }
                    if ($values.IsRectangle -eq 0 -and $name -in @('HalfWidthX','HalfWidthY')) { continue }
                }
                try {
                    $v=[double]$props[$name].GetValue($data,$null)
                    if ([double]::IsNaN($v) -or [double]::IsInfinity($v)) { throw 'nonfinite' }
                    $values[$name]=$v
                } catch { $errors+= $name }
            }
        }
        try { $hidden=[bool]$o.DrawData.DoNotDrawObject } catch {}
        $rows+=@{sourceIndex=$i;type=[string]$o.TypeName;comment=[string]$o.Comment;
            referenceIndex=[int]$o.RefObject;insideOfIndex=[int]$o.InsideOf;material=[string]$o.Material;
            localPositionMM=@([double]$o.XPosition,[double]$o.YPosition,[double]$o.ZPosition);
            localTiltDegrees=@([double]$o.TiltAboutX,[double]$o.TiltAboutY,[double]$o.TiltAboutZ);
            zosMatrix=(@([bool]$ok)+@($numbers));shapeParameters=$values;dimensionReadErrors=@($errors);
            zemaxHidden=$hidden;dependencyInspection='unavailable-legacy-read-only'}
    }
    return @{sourceFile=[string]$system.SystemFile;mode=[string]$system.Mode;
        lengthUnit=[string]$system.SystemData.Units.LensUnits;objectCount=$count;objects=@($rows)}
}
try {
    $request=[Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($request.target.family -notin @('zemax18','zemax19','zemaxLegacy')) { Fail 'TARGET_VERSION_MISMATCH' '只读桥仅支持 Zemax 19' }
    [Reflection.Assembly]::LoadFrom((Join-Path $request.target.installDir 'ZOSAPI_Interfaces.dll')) | Out-Null
    [Reflection.Assembly]::LoadFrom((Join-Path $request.target.installDir 'ZOSAPI.dll')) | Out-Null
    $connection=New-Object ZOSAPI.ZOSAPI_Connection
    $application=$connection.ConnectAsExtension([int]$request.instance)
    if ($null -eq $application) { Fail 'HOST_UNAVAILABLE' '无法连接 Interactive Extension 实例' }
    $version=[string]$application.OpticStudioVersion
    if ($request.target.apiBuild -and $version -ne [string]$request.target.apiBuild) { Fail 'TARGET_VERSION_MISMATCH' ('实际API构建号 '+$version+' 与所选安装 '+[string]$request.target.apiBuild+' 不一致；请核对多个窗口的Extension实例号') }
    $expectedMajor=if($request.target.apiBuildYear){[int]$request.target.apiBuildYear-2000}elseif($request.target.family -eq 'zemax18'){18}elseif($request.target.productMajor){[int]$request.target.productMajor}else{19}
    $versionPattern='^('+[string]$expectedMajor+'\d{4}|'+[string]$expectedMajor+'([.\s]|$)|20'+[string]$expectedMajor+'([.\s]|$))'
    if ($version -notmatch $versionPattern) { Fail 'TARGET_VERSION_MISMATCH' '实际宿主与所选旧版安装不一致，已停止' }
    if (-not $application.IsValidLicenseForAPI) { Fail 'HOST_UNAVAILABLE' ('API 未授权：'+[string]$application.LicenseStatus) }
    $system=$application.PrimarySystem
    if ([string]::IsNullOrWhiteSpace([string]$system.SystemFile)) { Fail 'UNSAVED_MODEL' '请先在 Zemax 中命名并保存模型' }
    if ($request.expectedFile -and [IO.Path]::GetFullPath([string]$system.SystemFile) -ne [IO.Path]::GetFullPath([string]$request.expectedFile)) { Fail 'UNEXPECTED_MODEL' '当前模型与配置不一致' }
    $dirtyBefore=[bool]$system.NeedsSave
    $systemId=[string]$system.SystemID
    $before=Read-Pass $system $request.fields
    $after=Read-Pass $system $request.fields
    $dirtyAfter=[bool]$system.NeedsSave
    if (($before | ConvertTo-Json -Depth 20 -Compress) -ne ($after | ConvertTo-Json -Depth 20 -Compress) -or $dirtyBefore -ne $dirtyAfter -or $systemId -ne [string]$system.SystemID) { Fail 'HOST_CHANGED_DURING_CAPTURE' '两次读取不一致，请在模型空闲时重试' }
    if ($null -ne $system.Tools.CurrentTool) { Fail 'HOST_BUSY' '采集期间有 Zemax 工具启动' }
    $before.provenance='zos-api';$before.capturedAt=[DateTime]::UtcNow.ToString('o')
    $before.captureEvidence=@{apiVersion=$version;connectionMode='extension';instance=[int]$request.instance;
        systemId=$systemId;dirtyBefore=$dirtyBefore;dirtyAfter=$dirtyAfter;matchingReadPasses=2;
        consistency='two matching reads; not an atomic host transaction';readOnly=$true;bridge='windows-powershell-5.1-netfx'}
    @{ok=$true;raw=$before} | ConvertTo-Json -Depth 30 -Compress
} catch {
    $message=[string]$_.Exception.Message; $code='HOST_UNAVAILABLE'
    if ($message -match '^([A-Z_]+)\|(.+)$') { $code=$Matches[1];$message=$Matches[2] }
    @{ok=$false;error=@{code=$code;message=$message}} | ConvertTo-Json -Depth 5 -Compress
    exit 1
}
