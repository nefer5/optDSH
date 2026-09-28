"""Short-lived read-only ZOS worker; reuses the opt-assist connection owner."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

from .domain import OpticsError, fingerprint, finite
from .geometry import read_dimensions


def read_pass(system):
    mode = str(system.Mode)
    if mode != "NonSequential":
        raise OpticsError("UNSUPPORTED_MODE", "Open a pure non-sequential test model")
    if system.Tools.CurrentTool is not None:
        raise OpticsError("HOST_BUSY", "An OpticStudio tool is active; finish it before capture")
    nce = system.NCE
    count = int(nce.NumberOfObjects)
    if not 0 < count <= 5000:
        raise OpticsError("UNSUPPORTED_SIZE", "Expected 1..5000 NSC objects")
    rows = []
    for index in range(1, count+1):
        obj = nce.GetObjectAt(index)
        # Required getters deliberately have no silent default values.
        row = {
            "sourceIndex": index, "type": str(obj.TypeName), "comment": str(obj.Comment or ""),
            "referenceIndex": int(obj.RefObject), "insideOfIndex": int(obj.InsideOf),
            "material": str(obj.Material or ""),
            "localPositionMM": finite([obj.XPosition, obj.YPosition, obj.ZPosition], 3),
            "localTiltDegrees": finite([obj.TiltAboutX, obj.TiltAboutY, obj.TiltAboutZ], 3),
        }
        result = nce.GetMatrix(index, *([0.0]*12))
        row["zosMatrix"] = [bool(result[0]), *[float(x) for x in result[1:]]]
        row.update(read_dimensions(obj))
        from .model_checks import read_model_checks
        row.update(read_model_checks(obj))
        rows.append(row)
    return {"sourceFile": str(system.SystemFile), "mode": mode,
            "lengthUnit": str(system.SystemData.Units.LensUnits),
            "objectCount": count, "objects": rows}


def snapshot_in_connection(zos, connection, instance):
    s = zos.system
    current = Path(str(s.SystemFile)).resolve()
    dirty_before = bool(s.NeedsSave)
    before = read_pass(s)
    after = read_pass(s)
    dirty_after = bool(s.NeedsSave)
    if Path(before['sourceFile']).resolve() != current or fingerprint(before) != fingerprint(after) or dirty_before != dirty_after:
        raise OpticsError("HOST_CHANGED_DURING_CAPTURE", "Consecutive reads differ; try again when the model is idle")
    if s.Tools.CurrentTool is not None:
        raise OpticsError("HOST_BUSY", "An OpticStudio tool became active during capture")
    before.update({"provenance": "zos-api", "capturedAt": datetime.now(timezone.utc).isoformat(),
                   "captureEvidence": {"apiVersion": str(zos.application.OpticStudioVersion),
                                       "connectionMode": "extension", "instance": instance, "systemId": str(s.SystemID),
                                       "dirtyBefore": dirty_before, "dirtyAfter": dirty_after,
                                       "matchingReadPasses": 2,
                                       "consistency": "two matching reads; not an atomic host transaction",
                                       "connectionSource": str(connection),
                                       "connectionSha256": hashlib.sha256(connection.read_bytes()).hexdigest()}})
    return before


def _capture_unlocked(expected_file, instance, probe=False):
    connection = Path(__file__).with_name("connection.py")
    if not connection.is_file():
        raise OpticsError("DEPENDENCY_MISSING", "local connection module is absent")
    from .connection import OpticStudio
    with OpticStudio(mode="extension", instance=instance) as zos:
        s = zos.system
        if not str(s.SystemFile).strip():
            raise OpticsError("UNSAVED_MODEL", "请先在 Zemax 中保存模型，再探测绑定；工作台不会替你保存")
        current = Path(str(s.SystemFile)).resolve()
        if probe:
            if str(s.Mode) != 'NonSequential' or str(s.SystemData.Units.LensUnits) != 'Millimeters':
                raise OpticsError('UNSUPPORTED_MODEL', '当前仅支持纯非序列、毫米单位模型')
            if s.Tools.CurrentTool is not None:
                raise OpticsError('HOST_BUSY', 'Zemax 正在运行工具，请结束后再探测')
            from .domain import make_snapshot
            raw = snapshot_in_connection(zos, connection, instance)
            snapshot = make_snapshot(raw)
            return {'modelId': snapshot['modelId'], 'revision': snapshot['revision'], 'systemId': str(s.SystemID),
                    'sourceFile': str(current), 'instance': instance, 'mode': str(s.Mode),
                    'lengthUnit': str(s.SystemData.Units.LensUnits), 'objectCount': int(s.NCE.NumberOfObjects),
                    'dirty': bool(s.NeedsSave)}
        if current != expected_file.resolve():
            raise OpticsError("UNEXPECTED_MODEL", "Active model differs from configured test file; no capture performed")
        return snapshot_in_connection(zos, connection, instance)


def capture(expected_file, instance, probe=False):
    # Coordinate across service restarts and CLI/native workers, not only HTTP threads.
    import msvcrt
    root=Path(__file__).resolve().parents[4]
    (root/'.runtime').mkdir(exist_ok=True)
    with (root/'.runtime/tx-pilot.lock').open('a+b') as lock:
        lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
        try:msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        except OSError:raise OpticsError('HOST_BUSY','原生公差或其他光学作业占用宿主') from None
        try:return _capture_unlocked(expected_file, instance, probe)
        finally:lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1)


def connection_error(exc, instance):
    message = f'{type(exc).__name__}: {exc}'[:600]
    if 'NotAuthorized' in message:
        message = (f'Interactive Extension 实例 {instance} 未获 API 连接授权（NotAuthorized）。'
                   '请核对目标 Zemax 窗口弹窗中的 Instance Number，并确认该窗口已开启 Interactive Extension；'
                   '此状态不等于许可证不支持 API。')
    return {'code': 'HOST_UNAVAILABLE', 'message': message}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--save-run", type=Path)
    parser.add_argument("--expected-file", type=Path)
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--instance", default=1, type=int)
    args = parser.parse_args()
    if args.save_run:
        from .model_save import execute_save_run
        print(json.dumps(execute_save_run(args.save_run), ensure_ascii=False, allow_nan=False))
        return
    if not args.probe and args.expected_file is None:
        parser.error('--expected-file required for capture')
    try:
        result = {"ok": True, "raw": capture(args.expected_file, args.instance, args.probe)}
    except OpticsError as exc:
        result = {"ok": False, "error": exc.payload()}
    except Exception as exc:
        # Connection/API diagnostics, no environment or credential dump.
        result = {"ok": False, "error": connection_error(exc, args.instance)}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
