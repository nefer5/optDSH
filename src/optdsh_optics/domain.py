"""Pure snapshot normalization and deterministic geometric queries."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math
from .geometry import classify, display_geometry


class OpticsError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code

    def payload(self):
        return {"code": self.code, "message": str(self)}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     allow_nan=False, separators=(",", ":")).encode()).hexdigest()


def finite(values, size):
    if len(values) != size or any(isinstance(v, bool) for v in values):
        raise OpticsError("INVALID_TRANSFORM", "Invalid coordinate shape")
    out = [float(v) for v in values]
    if not all(math.isfinite(v) for v in out):
        raise OpticsError("INVALID_TRANSFORM", "Non-finite coordinate")
    return out


def matrix_from_zos(values):
    """ZOS NCE.GetMatrix: success,R11..R33,Xo,Yo,Zo -> row-major 4x4."""
    if len(values) != 13 or not values[0]:
        raise OpticsError("TRANSFORM_UNAVAILABLE", "NCE.GetMatrix returned false")
    v = finite(values[1:], 12)
    rows = [v[0:3], v[3:6], v[6:9]]
    for i in range(3):
        for j in range(3):
            dot = sum(a*b for a, b in zip(rows[i], rows[j]))
            if abs(dot - (1 if i == j else 0)) > 1e-5:
                raise OpticsError("INVALID_TRANSFORM", "Rotation is not orthonormal")
    determinant = (v[0]*(v[4]*v[8]-v[5]*v[7]) - v[1]*(v[3]*v[8]-v[5]*v[6])
                   + v[2]*(v[3]*v[7]-v[4]*v[6]))
    if abs(determinant-1) > 1e-5:
        raise OpticsError("INVALID_TRANSFORM", "Rotation is not right-handed")
    return [*v[0:3], v[9], *v[3:6], v[10], *v[6:9], v[11], 0., 0., 0., 1.]


def make_snapshot(raw):
    if raw.get("mode") != "NonSequential":
        raise OpticsError("UNSUPPORTED_MODE", "MVP supports pure NonSequential systems only")
    if raw.get("lengthUnit") != "Millimeters":
        raise OpticsError("UNSUPPORTED_UNITS", "MVP requires Millimeters; no implicit conversion")
    objects = raw.get("objects", [])
    indices = [o["sourceIndex"] for o in objects]
    if indices != list(range(1, len(objects)+1)) or raw["objectCount"] != len(objects):
        raise OpticsError("INVALID_SNAPSHOT", "Object indices/count inconsistent")
    semantic = {k: raw[k] for k in ("sourceFile", "mode", "lengthUnit", "objects")}
    revision = "r-" + fingerprint(semantic)[:20]
    model_id = "m-" + fingerprint(raw["sourceFile"].replace("\\", "/").casefold())[:16]
    ref_ids = {i: f"{model_id}/{revision}/obj-{i}" for i in indices}
    normalized = []
    for row in objects:
        item = deepcopy(row)
        index, ref = row["sourceIndex"], row["referenceIndex"]
        if ref != 0 and ref not in ref_ids:
            raise OpticsError("INVALID_REFERENCE", f"OBJ{index} references absent OBJ{ref}")
        item["objectId"] = ref_ids[index]
        item["referenceObjectId"] = ref_ids.get(ref)
        item["label"] = f"OBJ{index}[{row['comment'] or '无 comment'}]"
        item["localPositionMM"] = finite(row["localPositionMM"], 3)
        item["localTiltDegrees"] = finite(row["localTiltDegrees"], 3)
        matrix = matrix_from_zos(row["zosMatrix"])
        item["worldTransform"] = matrix
        item["worldPositionMM"] = [matrix[i] for i in (3, 7, 11)]
        item["worldAxes"] = {axis: [matrix[col], matrix[col+4], matrix[col+8]]
                             for col, axis in enumerate(("x", "y", "z"))}
        item["displayCategory"] = classify(row)
        item["geometry"] = display_geometry(row)
        if raw["provenance"] == "synthetic":
            item["geometry"]["dimensionSource"] = "synthetic fixture (not measured)"
            item["geometry"]["note"] = item["geometry"]["note"].replace("来自API", "来自合成样例")
        normalized.append(item)
    from .boolean_geometry import attach_boolean_geometry
    attach_boolean_geometry(normalized)
    return {
        "schemaVersion": 1, "provenance": raw["provenance"], "modelId": model_id,
        "revision": revision, "capturedAt": raw.get("capturedAt", datetime.now(timezone.utc).isoformat()),
        "sourceFile": raw["sourceFile"], "frame": "NSC surface origin (pure NSC)",
        "units": {"length": "mm", "angle": "deg"}, "objectCount": len(objects),
        "identityPolicy": "revision-scoped; no cross-revision identity promise",
        "freshness": "captured-only; refresh to observe external changes",
        "captureEvidence": raw.get("captureEvidence", {}), "objects": normalized,
    }


def resolve_object(snapshot, model_id, revision, object_id):
    if model_id != snapshot["modelId"]:
        raise OpticsError("MODEL_MISMATCH", "Selection belongs to another model")
    if revision != snapshot["revision"]:
        raise OpticsError("STALE_REVISION", "Snapshot changed; refresh and reselect objects")
    for obj in snapshot["objects"]:
        if obj["objectId"] == object_id:
            return deepcopy(obj)
    raise OpticsError("OBJECT_NOT_FOUND", "Unknown or expired object reference")


def relative(snapshot, model_id, revision, from_id, to_id):
    a = resolve_object(snapshot, model_id, revision, from_id)
    b = resolve_object(snapshot, model_id, revision, to_id)
    delta = [y-x for x, y in zip(a["worldPositionMM"], b["worldPositionMM"])]
    axes = a["worldAxes"]
    local = [sum(x*y for x, y in zip(axes[axis], delta)) for axis in ("x", "y", "z")]
    return {
        "modelId": model_id, "revision": revision, "capturedAt": snapshot["capturedAt"],
        "from": {"objectId": from_id, "label": a["label"]},
        "to": {"objectId": to_id, "label": b["label"]},
        "deltaWorldMM": delta, "deltaInFromLocalMM": local,
        "originDistanceMM": math.sqrt(sum(x*x for x in delta)),
        "meaning": "to-origin minus from-origin; not surface clearance, optical path or collision",
        "freshness": snapshot["freshness"], "provenance": snapshot["provenance"],
    }
