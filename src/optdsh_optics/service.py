"""Serialized capture and immutable cached queries shared by Web and MCP."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import threading
import time

from .domain import OpticsError, make_snapshot, relative, resolve_object


class Bridge:
    def __init__(self, config, root):
        self.config, self.root = config, Path(root)
        self.capture_lock, self.state_lock = threading.Lock(), threading.Lock()
        self.snapshot, self.last_error = None, None
        self.events = []
        # Recover only the configured model's last successful capture. It remains
        # stale until a live refresh succeeds; queries already reject last_error.
        if config.get('backend') == 'zos-api':
            from .boolean_geometry import attach_boolean_geometry
            for path in sorted((self.root / 'artifacts/optics-captures').glob('*.json'), reverse=True):
                try:
                    saved = json.loads(path.read_text(encoding='utf-8'))
                    if (saved.get('provenance') != 'zos-api' or
                            Path(saved['sourceFile']).resolve() != Path(config['expectedFile']).resolve()):
                        continue
                    attach_boolean_geometry(saved['objects'])
                    from .geometry import display_geometry
                    for obj in saved['objects']:
                        if obj['type'] != 'Boolean Native':
                            obj['geometry'] = display_geometry(obj)
                    self.snapshot = saved
                    self.last_error = {'code': 'RESTORED_SNAPSHOT', 'message': 'Historical capture restored; live refresh required before queries'}
                    break
                except (OSError, ValueError, KeyError, TypeError):
                    continue

    def event(self, kind, **details):
        with self.state_lock:
            self.events.append({"time": datetime.now(timezone.utc).isoformat(), "kind": kind, **details})
            self.events = self.events[-60:]

    def refresh(self):
        if not self.capture_lock.acquire(blocking=False):
            raise OpticsError("HOST_BUSY", "Another capture is already running")
        start = time.monotonic()
        self.event("capture/start", backend=self.config["backend"])
        try:
            if self.config["backend"] == "synthetic":
                raw = json.loads((self.root / "examples/bridge-demo.json").read_text(encoding="utf-8"))
                raw["capturedAt"] = datetime.now(timezone.utc).isoformat()
            elif self.config["backend"] == "zos-api":
                args = [self.config["python"], "-X", "utf8", str(self.root / "scripts/optics-worker.py"),
                        "--source-root", self.config["sourceRoot"], "--expected-file", self.config["expectedFile"],
                        "--instance", str(self.config.get("instance", 1))]
                try:
                    run = subprocess.run(args, cwd=self.root, capture_output=True, text=True, encoding="utf-8",
                                         timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                except subprocess.TimeoutExpired:
                    raise OpticsError("HOST_TIMEOUT", "Read-only worker exceeded 30s; cached snapshot is now stale") from None
                if run.returncode:
                    raise OpticsError("WORKER_FAILED", "Capture worker failed; no new snapshot published")
                try:
                    result = json.loads(run.stdout)
                except ValueError:
                    raise OpticsError("INVALID_WORKER_RESULT", "Capture did not return valid JSON") from None
                if not result["ok"]:
                    raise OpticsError(result["error"]["code"], result["error"]["message"])
                raw = result["raw"]
            else:
                raise OpticsError("INVALID_CONFIG", "Unknown backend; no silent demo fallback")
            snapshot = make_snapshot(raw)
            target = self.root / "artifacts/optics-captures"
            target.mkdir(parents=True, exist_ok=True)
            name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            (target / f"{name}-{snapshot['revision']}.json").write_text(
                json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False)+"\n", encoding="utf-8")
            with self.state_lock:
                self.snapshot, self.last_error = snapshot, None
            self.event("capture/complete", revision=snapshot["revision"], objects=snapshot["objectCount"],
                       elapsedMs=round((time.monotonic()-start)*1000))
            return self.view()
        except Exception as exc:
            error = exc if isinstance(exc, OpticsError) else OpticsError("CAPTURE_FAILED", type(exc).__name__)
            with self.state_lock:
                self.last_error = error.payload()
            self.event("capture/error", **error.payload())
            raise error
        finally:
            self.capture_lock.release()

    def view(self):
        with self.state_lock:
            return {"backend": self.config["backend"], "busy": self.capture_lock.locked(),
                    "snapshot": deepcopy(self.snapshot), "error": deepcopy(self.last_error),
                    "events": deepcopy(self.events), "readOnly": True}

    def current(self):
        with self.state_lock:
            if self.last_error:
                raise OpticsError("STALE_SNAPSHOT", "Last refresh failed; inspect status and refresh before querying")
            if self.snapshot is None:
                raise OpticsError("NO_SNAPSHOT", "Refresh the bridge before querying")
            return deepcopy(self.snapshot)

    def query(self, kind, params):
        snapshot = self.current()
        if kind == "list":
            offset, limit = int(params.get("offset", 0)), int(params.get("limit", 20))
            if offset < 0 or not 1 <= limit <= 100:
                raise OpticsError("INVALID_ARGUMENT", "offset >=0 and limit 1..100 required")
            query = str(params.get("query", "")).casefold()
            rows = [o for o in snapshot["objects"] if query in (o["label"]+" "+o["type"]).casefold()]
            result = {k: snapshot[k] for k in ("modelId", "revision", "capturedAt", "provenance", "freshness", "units")}
            result.update({"total": len(rows), "offset": offset, "nextOffset": offset+limit if offset+limit < len(rows) else None,
                           "objects": [{k: o[k] for k in ("objectId", "label", "type", "referenceIndex", "worldPositionMM")}
                                       for o in rows[offset:offset+limit]]})
        else:
            for key in ("modelId", "revision"):
                if not params.get(key):
                    raise OpticsError("INVALID_ARGUMENT", f"Missing {key}")
            if kind == "selection":
                obj = resolve_object(snapshot, params['modelId'], params['revision'], params.get('objectId'))
                result = {k:snapshot[k] for k in ('modelId','revision','capturedAt','provenance','freshness')}
                result['object'] = obj
                ids=params.get('objectIds',[obj['objectId']])
                if isinstance(ids,str): ids=json.loads(ids)
                if not isinstance(ids,list) or not 1<=len(ids)<=16:raise OpticsError('INVALID_ARGUMENT','Expected 1..16 selected objects')
                result['selectedObjects']=[resolve_object(snapshot,params['modelId'],params['revision'],i) for i in dict.fromkeys(ids)]
                if len(result['selectedObjects'])==2 and not params.get('toId'):
                    first,second=result['selectedObjects']
                    result['referencePairInDraftOrder']=relative(snapshot,params['modelId'],params['revision'],first['objectId'],second['objectId'])
                operands=obj.get('booleanDisplay',{}).get('operandIds',[])
                operands=list(dict.fromkeys(i for o in result['selectedObjects'] for i in o.get('booleanDisplay',{}).get('operandIds',[])))
                result['operands']=[resolve_object(snapshot,params['modelId'],params['revision'],i) for i in operands]
                result['reference'] = (resolve_object(snapshot,params['modelId'],params['revision'],obj['referenceObjectId']) if obj.get('referenceObjectId') else None)
                if params.get('toId'): result['relative'] = relative(snapshot,params['modelId'],params['revision'],obj['objectId'],params['toId'])
            elif kind == "object":
                result = {k: snapshot[k] for k in ("modelId", "revision", "capturedAt", "freshness", "provenance", "units")}
                result["object"] = resolve_object(snapshot, params["modelId"], params["revision"], params.get("objectId"))
            elif kind == "relative":
                result = relative(snapshot, params["modelId"], params["revision"], params.get("fromId"), params.get("toId"))
            else:
                raise OpticsError("UNKNOWN_QUERY", "Unsupported query")
        self.event("query/"+kind, revision=snapshot["revision"])
        return result
