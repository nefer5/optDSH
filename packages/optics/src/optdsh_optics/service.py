"""Serialized capture and immutable cached queries shared by Web and MCP."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import threading
import time
import secrets
import os
import re

from .domain import OpticsError, make_snapshot, relative, resolve_object, fingerprint
from .run_bundle import RunBundle, write_json


class Bridge:
    def __init__(self, config, root, config_path=None):
        self.config, self.root = dict(config), Path(root)
        self.config_path = Path(config_path) if config_path else None
        self.config_bytes = self.config_path.read_bytes() if self.config_path else None
        self.candidates = {}
        self.save_receipt_file = self.root/'data/optics/save-requests.json'
        self.save_receipts = json.loads(self.save_receipt_file.read_text(encoding='utf-8')) if self.save_receipt_file.exists() else {}
        self.capture_lock, self.state_lock = threading.Lock(), threading.Lock()
        self.snapshot, self.last_error = None, None
        self.events = []
        # Recover only the configured model's last successful capture. It remains
        # stale until a live refresh succeeds; queries already reject last_error.
        if config.get('backend') == 'zos-api':
            from .boolean_geometry import attach_boolean_geometry
            for path in sorted((self.root / 'data/optics/captures').glob('*.json'), reverse=True):
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

    def _worker(self, config, probe=False):
        args = [str(self.root/config['python']), '-X', 'utf8', str(self.root/'packages/optics/scripts/worker.py'),
                '--instance', str(config.get('instance', 1))]
        args += ['--probe'] if probe else ['--expected-file', config['expectedFile']]
        try:
            run = subprocess.run(args, cwd=self.root, capture_output=True, text=True, encoding='utf-8',
                                 timeout=30, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except subprocess.TimeoutExpired:
            raise OpticsError('HOST_TIMEOUT', '只读连接超过30秒，请检查 Interactive Extension') from None
        if run.returncode:
            raise OpticsError('WORKER_FAILED', '只读采集进程失败')
        try:
            result = json.loads(run.stdout)
        except ValueError:
            raise OpticsError('INVALID_WORKER_RESULT', '采集进程返回无效数据') from None
        if not result['ok']:
            raise OpticsError(result['error']['code'], result['error']['message'])
        return result['raw']

    def binding(self):
        return {'sourceFile': self.config.get('expectedFile'), 'instance': self.config.get('instance', 1),
                **self.config.get('binding', {})}

    def probe(self, instance):
        if type(instance) is not int or not 1 <= instance <= 100:
            raise OpticsError('INVALID_ARGUMENT', '实例编号必须是1–100的整数')
        if not self.capture_lock.acquire(blocking=False):
            raise OpticsError('HOST_BUSY', '采集或切换正在进行')
        try:
            if self.config['backend'] != 'zos-api':
                raise OpticsError('INVALID_CONFIG', '合成后端不连接真实模型')
            raw = self._worker({**self.config, 'instance': instance}, probe=True)
            now = time.monotonic()
            self.candidates = {k:v for k,v in self.candidates.items() if v['expires'] > now}
            if len(self.candidates) >= 16:
                self.candidates.pop(next(iter(self.candidates)))
            token = secrets.token_urlsafe(24)
            self.candidates[token] = {'model': raw, 'expires': now+300, 'config': deepcopy(self.config)}
            if Path(raw['sourceFile']).resolve() != Path(self.config['expectedFile']).resolve():
                with self.state_lock:
                    self.last_error = {'code':'MODEL_CHANGED', 'message':'API当前模型与已绑定模型不同，请确认切换；保留旧快照'}
            return {'candidateId': token, 'candidate': raw, 'binding': self.binding(), 'expiresInSeconds': 300}
        except Exception as exc:
            exc = exc if isinstance(exc, OpticsError) else OpticsError('PROBE_FAILED', type(exc).__name__)
            with self.state_lock:
                self.last_error = exc.payload()
            raise exc
        finally:
            self.capture_lock.release()

    def switch(self, candidate_id):
        if not isinstance(candidate_id, str) or not candidate_id:
            raise OpticsError('INVALID_ARGUMENT', '请先探测模型，再确认绑定')
        return self.refresh(candidate_id=candidate_id)

    def _save_worker(self, run):
        try:
            result = subprocess.run([str(self.root/self.config['python']), '-X', 'utf8', str(self.root/'packages/optics/scripts/worker.py'),
                                     '--save-run', str(run)], cwd=self.root, capture_output=True,
                                    text=True, encoding='utf-8', timeout=30,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if result.returncode:
                raise ValueError('worker exited')
            value = json.loads(result.stdout)
        except (subprocess.TimeoutExpired, ValueError, OSError):
            raise OpticsError('SAVE_UNCERTAIN', '保存进程结果未确认；请核对 Zemax 和运行记录，不会自动重试') from None
        if not value['ok']:
            raise OpticsError(value['error']['code'], value['error']['message'])
        return value

    def save_model(self, request):
        if not isinstance(request, dict) or request.get('authorizeSave') is not True:
            raise OpticsError('SAVE_NOT_AUTHORIZED', '点击保存按钮才授权写盘')
        request_id = request.get('requestId', '')
        if not isinstance(request_id, str) or not re.fullmatch(r'save-[a-f0-9-]{36}', request_id):
            raise OpticsError('INVALID_ARGUMENT', '缺少有效保存请求编号')
        if not self.capture_lock.acquire(blocking=False):
            raise OpticsError('HOST_BUSY', '连接、刷新或保存正在进行，请稍后再试')
        record = None
        try:
            signature = fingerprint(request)
            prior = self.save_receipts.get(request_id)
            if prior:
                if prior['hash'] != signature:
                    raise OpticsError('REQUEST_CONFLICT', '同一保存编号的内容不能变化')
                if prior['status'] != 'completed':
                    raise OpticsError('SAVE_UNCERTAIN', '本次保存已有执行记录，请核对 '+prior['run']+'；不会重复写盘')
                return {'view':self.view(), 'saved':prior['saved'], 'replayed':True}
            if self.config['backend'] != 'zos-api':
                raise OpticsError('INVALID_CONFIG', '合成快照不能保存到Zemax')
            if request.get('bindingId') != self.binding().get('id'):
                raise OpticsError('STALE_BINDING', '工作台绑定已变化，未保存；请刷新')
            candidate_id = request.get('candidateId')
            candidate = self.candidates.get(candidate_id) if isinstance(candidate_id, str) else None
            config = dict(self.config)
            if candidate_id is not None:
                if not candidate or candidate['expires'] < time.monotonic() or candidate['config'] != self.config:
                    raise OpticsError('STALE_CANDIDATE', '探测结果过期，未保存；请重新探测')
                target = candidate['model']
                config.update(expectedFile=target['sourceFile'], instance=target['instance'])
                model_id, revision, system_id = target.get('modelId'), target.get('revision'), target.get('systemId')
            else:
                snapshot = self.snapshot
                if self.last_error or snapshot is None:
                    raise OpticsError('STALE_SNAPSHOT', '请先成功刷新模型再保存')
                model_id, revision = request.get('modelId'), request.get('expectedRevision')
                if model_id != snapshot['modelId'] or revision != snapshot['revision']:
                    raise OpticsError('STALE_REVISION', '模型版本已变化，未保存；请刷新')
                system_id = snapshot.get('captureEvidence', {}).get('systemId')
            if not all(isinstance(x, str) and x for x in (model_id, revision, system_id)):
                raise OpticsError('STALE_SNAPSHOT', '缺少当前宿主身份，请刷新或重新探测')
            config.update(projectRoot=str(self.root), modelId=model_id, expectedRevision=revision,
                          systemId=system_id, authorization='explicit-save-button', requestId=request_id,
                          report={'background':'用户点击工作台保存按钮，将目标Zemax当前内存状态保存到原文件。',
                                  'objective':'版本与系统身份校验、旧磁盘备份、保存后回读。'})
            bundle = RunBundle.create(self.root, 'model-save', config, mode='execute', complexity='simple')
            record = {'hash':signature, 'status':'started', 'run':str(bundle.path)}
            self.save_receipts[request_id] = record
            write_json(self.save_receipt_file, self.save_receipts)
            self.event('save/start', sourceFile=config['expectedFile'], instance=config['instance'])
            result = self._save_worker(bundle.path)
            raw, saved = result['raw'], result['saved']
            snapshot = make_snapshot(raw)
            if snapshot['modelId'] != model_id or snapshot['revision'] != revision or raw['captureEvidence']['dirtyAfter']:
                raise OpticsError('SAVE_UNCERTAIN', '保存后身份或状态校验失败，请检查Zemax')
            record.update(status='completed', saved=saved)
            write_json(self.save_receipt_file, self.save_receipts)
            if (Path(config['expectedFile']).resolve() == Path(self.config['expectedFile']).resolve()
                    and config['instance'] == self.config.get('instance', 1)):
                with self.state_lock:
                    self.snapshot, self.last_error = snapshot, None
            if candidate:
                candidate['model']['dirty'] = False
                candidate['expires'] = time.monotonic()+300
            self.event('save/complete', sourceFile=config['expectedFile'], instance=config['instance'], run=str(bundle.path))
            return {'view':self.view(), 'saved':saved, 'candidateId':candidate_id,
                    'candidate':deepcopy(candidate['model']) if candidate else None}
        except Exception as exc:
            error = exc if isinstance(exc, OpticsError) else OpticsError('SAVE_UNCERTAIN', '保存结果未确认：'+type(exc).__name__)
            if record:
                record.update(status='uncertain', error=error.payload())
                try:
                    write_json(self.save_receipt_file, self.save_receipts)
                except OSError:
                    error = OpticsError('SAVE_UNCERTAIN', '保存回执写入失败，请核对Zemax和run记录；不会自动重试')
                with self.state_lock:
                    self.last_error = error.payload()
            self.event('save/error', **error.payload())
            raise error
        finally:
            self.capture_lock.release()

    def refresh(self, candidate_id=None):
        if not self.capture_lock.acquire(blocking=False):
            raise OpticsError("HOST_BUSY", "Another capture is already running")
        start = time.monotonic()
        self.event("capture/start", backend=self.config["backend"])
        try:
            config = self.config
            if candidate_id is not None:
                candidate = self.candidates.get(candidate_id) if isinstance(candidate_id, str) else None
                if not candidate or candidate['expires'] < time.monotonic() or candidate['config'] != self.config:
                    raise OpticsError('STALE_CANDIDATE', '探测结果已过期或绑定已改变，请重新探测')
                if not self.config_path:
                    raise OpticsError('INVALID_CONFIG', '缺少可持久化的本地配置路径')
                config = {**self.config, 'expectedFile': candidate['model']['sourceFile'],
                          'instance': candidate['model']['instance'],
                          'binding': {'id': secrets.token_hex(12), 'changedAt': datetime.now(timezone.utc).isoformat(),
                                      'previousFile': self.config.get('expectedFile')}}
            if self.config["backend"] == "synthetic":
                raw = json.loads((self.root / "examples/bridge-demo.json").read_text(encoding="utf-8"))
                raw["capturedAt"] = datetime.now(timezone.utc).isoformat()
            elif self.config["backend"] == "zos-api":
                raw = self._worker(config)
            else:
                raise OpticsError("INVALID_CONFIG", "Unknown backend; no silent demo fallback")
            snapshot = make_snapshot(raw)
            if config['backend'] == 'zos-api' and Path(snapshot['sourceFile']).resolve() != Path(config['expectedFile']).resolve():
                raise OpticsError('UNEXPECTED_MODEL', '确认后宿主模型已变化，请重新探测')
            target = self.root / "data/optics/captures"
            target.mkdir(parents=True, exist_ok=True)
            name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            (target / f"{name}-{snapshot['revision']}.json").write_text(
                json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False)+"\n", encoding="utf-8")
            if candidate_id is not None:
                if self.config_path.read_bytes() != self.config_bytes:
                    raise OpticsError('CONFIG_CHANGED', '本地配置被其他程序修改，请重启桥接后重试')
                data = (json.dumps(config, ensure_ascii=False, indent=2)+'\n').encode('utf-8')
                temp = self.config_path.with_name(self.config_path.name+'.'+secrets.token_hex(6)+'.tmp')
                temp.write_bytes(data)
                os.replace(temp, self.config_path)
                self.config_bytes = data
            with self.state_lock:
                self.config = config
                self.snapshot, self.last_error = snapshot, None
            if candidate_id is not None:
                self.candidates.clear()
                self.event('binding/changed', **self.binding())
            self.event("capture/complete", revision=snapshot["revision"], objects=snapshot["objectCount"],
                       elapsedMs=round((time.monotonic()-start)*1000))
            return self.view()
        except Exception as exc:
            error = exc if isinstance(exc, OpticsError) else OpticsError("CAPTURE_FAILED", type(exc).__name__)
            # A second window's expired confirmation must not invalidate an
            # already successful binding; no host operation happened for it.
            if error.code != 'STALE_CANDIDATE':
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
                    "events": deepcopy(self.events), "readOnly": False, "capabilities":{"queriesReadOnly":True,"explicitSave":True}, "binding": self.binding()}

    def current(self):
        with self.state_lock:
            if self.capture_lock.locked():
                raise OpticsError('HOST_BUSY', '正在连接或采集，请稍后查询')
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
