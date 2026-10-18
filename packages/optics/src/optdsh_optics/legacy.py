"""Zemax 18/19 只读采集：在独立 Windows PowerShell 5.1/.NET Framework 进程运行。"""
import hashlib
import json
import os
from pathlib import Path
import subprocess

from .domain import OpticsError, make_snapshot
from .geometry import FIELDS
from .runtime import validate_target, validate_host_version


def capture_legacy(expected_file, instance, probe, target):
    target=validate_target(target)
    if target['family'] not in ('zemax18','zemax19','zemaxLegacy'):
        raise OpticsError('TARGET_VERSION_MISMATCH','旧版只读桥仅支持 Zemax 18/19')
    executable=Path(os.environ.get('WINDIR','C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe'
    script=Path(__file__).with_suffix('.ps1')
    if not executable.is_file() or not script.is_file():
        raise OpticsError('DEPENDENCY_MISSING','缺少 Windows PowerShell 5.1 或包内只读桥')
    request={'target':target,'instance':int(instance),'fields':FIELDS,
             'expectedFile':str(Path(expected_file).resolve()) if expected_file else None}
    try:
        result=subprocess.run([str(executable),'-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(script)],
            input=json.dumps(request),capture_output=True,text=True,encoding='utf-8',timeout=25,
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    except subprocess.TimeoutExpired:
        raise OpticsError('HOST_UNAVAILABLE','Zemax 18/19 只读采集超时；未执行保存或追迹') from None
    try:
        payload=json.loads(result.stdout.lstrip('\ufeff'))
    except (ValueError,TypeError):
        raise OpticsError('HOST_UNAVAILABLE','Zemax 18/19 桥未返回有效结果；请核对 Interactive Extension 实例') from None
    if not payload.get('ok'):
        error=payload.get('error',{})
        raise OpticsError(error.get('code','HOST_UNAVAILABLE'),error.get('message','Zemax 18/19 连接失败'))
    raw=payload['raw']
    validate_host_version(raw['captureEvidence']['apiVersion'],target)
    if expected_file is not None and Path(raw['sourceFile']).resolve()!=Path(expected_file).resolve():
        raise OpticsError('UNEXPECTED_MODEL','目标模型与配置不一致，未采集为当前绑定')
    raw['captureEvidence'].update(connectionSource=str(script),connectionSha256=hashlib.sha256(script.read_bytes()).hexdigest())
    snapshot=make_snapshot(raw)
    if probe:
        return {'modelId':snapshot['modelId'],'revision':snapshot['revision'],
                'systemId':raw['captureEvidence']['systemId'],'sourceFile':raw['sourceFile'],
                'instance':instance,'mode':raw['mode'],'lengthUnit':raw['lengthUnit'],
                'objectCount':raw['objectCount'],'dirty':raw['captureEvidence']['dirtyAfter'],
                'apiVersion':raw['captureEvidence']['apiVersion'],'readOnly':True}
    return raw
