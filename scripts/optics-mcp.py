"""Dependency-free MCP stdio adapter for the local read-only optics service."""
import json
import os
import importlib.util
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[1]
STRING = {"type": "string", "minLength": 1}
BASE = {"modelId": STRING, "revision": STRING}


def tool(name, description, props, required=()):
    return {"name": name, "description": description,
            "inputSchema": {"type": "object", "properties": props, "required": list(required), "additionalProperties": False},
            "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False}}


TOOLS = [
    tool("scene_objects", "List/filter captured NSC objects and resolved world positions. Returns modelId/revision and capturedAt; does not refresh live host. Use snapshot_refresh when current host state is needed.",
         {"query": {"type": "string"}, "offset": {"type": "integer", "minimum": 0}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}),
    tool("object_info", "Read one revision-scoped object: local/world positions, axes, raw GetMatrix and references. No physical surface geometry. A stale version is refused.",
         {**BASE, "objectId": STRING}, ("modelId", "revision", "objectId")),
    tool("relative_position", "Deterministically calculate TO origin minus FROM origin in NSC/world and FROM-local frames, plus origin distance in mm. Not surface clearance or optical path. Use exact IDs and revision from scene_objects.",
         {**BASE, "fromId": STRING, "toId": STRING}, ("modelId", "revision", "fromId", "toId")),
    tool("snapshot_refresh", "Read-only refresh from the configured existing Interactive Extension model. Never opens, saves, traces or changes a model. Can fail busy/disconnected; no automatic demo fallback.", {}),
]
if os.environ.get('OPTDSH_REQUEST_FILE'):
    TOOLS.append(tool('selection_context', 'Read the user-selected object, Boolean operands, reference object and optional deterministic relative position. Identity and revision are bound by the workbench; no arguments needed. Errors are authoritative; do not infer expiry from timestamps.', {}))
    TOOLS.append(tool('workflow_guide','Read project workflow instructions and independent Tx/Rx configuration. This read-only tool never executes simulations.',{'name':{'type':'string','enum':['assembly-tolerance','tx-tolerance','rx-tolerance','expert-collaboration']}},('name',)))


def call(name, params):
    try:
        if name=='workflow_guide':
            guide=params.get('name')
            if guide not in ('assembly-tolerance','tx-tolerance','rx-tolerance','expert-collaboration'):raise ValueError('Unknown workflow')
            folder=ROOT/'.agents/skills'/('optdsh-'+guide)
            result={'skill':(folder/'SKILL.md').read_text(encoding='utf-8')}
            if guide in ('assembly-tolerance','tx-tolerance','rx-tolerance'):
                folder=ROOT/'.agents/skills/optdsh-assembly-tolerance'
                result['workflow']=(folder/'references/workflow.md').read_text(encoding='utf-8')
                spec=importlib.util.spec_from_file_location('tolerance_preflight',folder/'scripts/preflight.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
                case_path=ROOT/('config/'+guide+'.local.json')
                if not case_path.exists():case_path=ROOT/'examples/txrx-assembly-tolerance.json'
                case=json.loads(case_path.read_text(encoding='utf-8'))
                if guide!='assembly-tolerance':
                    case['scope']=guide.split('-')[0]
                    case.pop('rx' if case['scope']=='tx' else 'tx',None)
                    case.pop('candidateAssemblies',None)
                result['preflight']=module.check(case)
                result['caseSummary']={k:case.get(k) for k in ('status','modelId','revision','tx','rx','candidateAssemblies')}
                result['caseWarning']='Mapping candidates are not approved mechanics; revalidate revision before use.'
                if guide=='tx-tolerance':
                    sys.path.insert(0,str(ROOT/'src'))
                    from optdsh_optics.config_io import load_config
                    pilot=ROOT/'config/tx-pilot.local.yaml'
                    if not pilot.exists():pilot=ROOT/'config/tx-pilot.local.json'
                    if pilot.exists():
                        result['pilotConfig']=load_config(pilot)
                        result['pilotConfigSource']=str(pilot.relative_to(ROOT))
            return {'content':[{'type':'text','text':json.dumps(result,ensure_ascii=False)}],'isError':False}
        state = json.loads((ROOT / ".runtime/optics-access.json").read_text(encoding="utf-8"))
        url = urlsplit(state["url"])
        if url.scheme != "http" or url.hostname != "127.0.0.1" or url.path not in ("", "/") or url.username or url.query:
            raise ValueError("Invalid local bridge address")
        routes = {"scene_objects": "list", "object_info": "object", "relative_position": "relative"}
        if name == 'selection_context':
            bound=json.loads(Path(os.environ['OPTDSH_REQUEST_FILE']).read_text(encoding='utf-8'))
            params={k:bound[k] for k in ('modelId','revision','objectId','toId') if bound.get(k)}
            if bound.get('objectIds'):params['objectIds']=json.dumps(bound['objectIds'])
            target='/api/selection?'+urlencode(params)
        else:
            target = "/api/refresh" if name == "snapshot_refresh" else "/api/"+routes[name]+"?"+urlencode(params)
        req = Request(state["url"]+target, headers={"Authorization": "Bearer "+state["token"]},
                      method="POST" if name == "snapshot_refresh" else "GET")
        with build_opener(ProxyHandler({})).open(req, timeout=40) as response:
            result = json.load(response)
        if name == "snapshot_refresh":
            snap = result.get("snapshot") or {}
            result = {k: snap.get(k) for k in ("modelId", "revision", "capturedAt", "objectCount", "provenance", "freshness")}
        return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}], "isError": False}
    except HTTPError as exc:
        try:
            error = json.load(exc)
        except ValueError:
            error = {"error": {"code": "HTTP_ERROR", "message": str(exc.code)}}
    except (URLError, OSError, ValueError, KeyError):
        error = {"error": {"code": "BRIDGE_UNAVAILABLE", "message": "Start scripts/start-optics.ps1 and verify its local status"}}
    return {"content": [{"type": "text", "text": json.dumps(error, ensure_ascii=False)}], "isError": True}


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        try:
            msg = json.loads(line)
        except ValueError:
            print(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}), flush=True)
            continue
        if "id" not in msg:
            continue
        method, params = msg.get("method"), msg.get("params", {})
        error = None
        if method == "initialize":
            result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                      "serverInfo": {"name": "optdsh-optics", "version": "0.1.0"}}
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            name, args = params.get("name"), params.get("arguments", {})
            spec = next((t for t in TOOLS if t["name"] == name), None)
            if spec is None or not isinstance(args, dict):
                error = {"code": -32602, "message": "Unknown tool or invalid arguments"}
            else:
                schema = spec["inputSchema"]
                bad = set(args)-set(schema["properties"]) or set(schema["required"])-set(args)
                for key, value in args.items():
                    field = schema["properties"].get(key, {})
                    if field.get("type") == "string" and (not isinstance(value, str) or len(value) < field.get("minLength", 0)):
                        bad = True
                    if field.get("type") == "integer" and (type(value) is not int or not field.get("minimum", 0) <= value <= field.get("maximum", 100000)):
                        bad = True
                if bad:
                    error = {"code": -32602, "message": "Invalid tool arguments"}
                else:
                    result = call(name, args)
        else:
            error = {"code": -32601, "message": "Method not found"}
        response = {"jsonrpc": "2.0", "id": msg["id"]}
        response["error" if error else "result"] = error if error else result
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
