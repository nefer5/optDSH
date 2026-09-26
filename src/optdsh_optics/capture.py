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
        rows.append(row)
    return {"sourceFile": str(system.SystemFile), "mode": mode,
            "lengthUnit": str(system.SystemData.Units.LensUnits),
            "objectCount": count, "objects": rows}


def capture(source_root, expected_file, instance):
    connection = source_root / "src/auto_zemax/connection.py"
    if not connection.is_file():
        raise OpticsError("DEPENDENCY_MISSING", "opt-assist connection source is absent")
    sys.path.insert(0, str(source_root / "src"))
    from auto_zemax import OpticStudio
    with OpticStudio(mode="extension", instance=instance) as zos:
        s = zos.system
        current = Path(str(s.SystemFile)).resolve()
        if current != expected_file.resolve():
            raise OpticsError("UNEXPECTED_MODEL", "Active model differs from configured test file; no capture performed")
        dirty_before = bool(s.NeedsSave)
        before = read_pass(s)
        after = read_pass(s)
        dirty_after = bool(s.NeedsSave)
        if fingerprint(before) != fingerprint(after) or dirty_before != dirty_after:
            raise OpticsError("HOST_CHANGED_DURING_CAPTURE", "Consecutive reads differ; try again when the model is idle")
        if s.Tools.CurrentTool is not None:
            raise OpticsError("HOST_BUSY", "An OpticStudio tool became active during capture")
        before.update({"provenance": "zos-api", "capturedAt": datetime.now(timezone.utc).isoformat(),
                       "captureEvidence": {"apiVersion": str(zos.application.OpticStudioVersion),
                                           "connectionMode": "extension", "instance": instance,
                                           "dirtyBefore": dirty_before, "dirtyAfter": dirty_after,
                                           "matchingReadPasses": 2,
                                           "consistency": "two matching reads; not an atomic host transaction",
                                           "connectionSource": str(connection),
                                           "connectionSha256": hashlib.sha256(connection.read_bytes()).hexdigest()}})
        return before


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--expected-file", required=True, type=Path)
    parser.add_argument("--instance", default=1, type=int)
    args = parser.parse_args()
    try:
        result = {"ok": True, "raw": capture(args.source_root, args.expected_file, args.instance)}
    except OpticsError as exc:
        result = {"ok": False, "error": exc.payload()}
    except Exception as exc:
        # Connection/API diagnostics, no environment or credential dump.
        result = {"ok": False, "error": {"code": "HOST_UNAVAILABLE", "message": f"{type(exc).__name__}: {exc}"[:600]}}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
