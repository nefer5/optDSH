"""Bounded asynchronous native tolerance jobs using the bridge's host lock."""
from copy import deepcopy
from pathlib import Path
import json
import subprocess
import threading
import time
import uuid

from .domain import OpticsError, fingerprint
from .run_bundle import RunBundle, write_json
from .tx_native import validate

class TxJobs:
    def __init__(self, bridge):
        self.bridge=bridge;self.root=bridge.root;self.lock=threading.RLock()
        self.file=self.root/'data/optics/tx-jobs.json';self.jobs=json.loads(self.file.read_text(encoding='utf-8')) if self.file.exists() else []
        for j in self.jobs:
            if j['status'] in ('running','queued','cancelling'):
                # Never claim stopped or resubmit an uncertain native operation.
                j.update(status='interrupted',error='服务重启；请核对原生工具和run，不自动重放')
        self.active=None
    def persist(self):write_json(self.file,self.jobs[-30:])
    def view(self):
        with self.lock:
            out=[]
            for j in self.jobs[-20:]:
                row=deepcopy(j);p=Path(j['run'])
                if row['status'] in ('queued','running','cancelling') and (p/'progress.json').exists():
                    try:row.update(json.loads((p/'progress.json').read_text(encoding='utf-8')))
                    except (OSError,ValueError):pass
                if (p/'result.json').exists():
                    try:row['result']=json.loads((p/'result.json').read_text(encoding='utf-8'))
                    except (OSError,ValueError):pass
                elif row['status'] in ('queued','running','cancelling') and (p/'partial-result.json').exists():
                    try:row['result']={**json.loads((p/'partial-result.json').read_text(encoding='utf-8')),'status':'running','partial':True}
                    except (OSError,ValueError):pass
                out.append(row)
            return {'jobs':out,'activeId':self.active}
    def start(self, body):
        if body.get('authorizeRun') is not True:raise OpticsError('TX_AUTH','需要点击副本运行授权')
        rid=body.get('requestId')
        try:uuid.UUID(rid)
        except (ValueError,TypeError,AttributeError):raise OpticsError('TX_CONFIG','无效请求ID')
        with self.lock:
            sig=fingerprint(body)
            for j in self.jobs:
                if j['requestId']==rid:
                    if j['requestHash']!=sig:raise OpticsError('REQUEST_CONFLICT','请求ID内容冲突')
                    return {'job':deepcopy(j)}
            snapshot=self.bridge.current()
            supplied=body.get('config',{})
            custom=supplied.get('analysis',{}).get('mode')=='custom'
            if custom:
                from .tx_custom import validate as validate_custom
                config=validate_custom(supplied,snapshot)
            else:config=validate(supplied,snapshot)
            if self.active or not self.bridge.capture_lock.acquire(blocking=False):raise OpticsError('HOST_BUSY','其他采集或仿真正在占用宿主')
            try:
                rt={k:self.bridge.config[k] for k in ('expectedFile','instance','python')}
                rt.update(projectRoot=str(self.root),systemId=snapshot['captureEvidence']['systemId'])
                config['report']={'title':'Tx 原生公差分析','background':'使用Zemax原生Tolerancing评价盲装误差和耦合补偿。','objective':'对die1/die2 RMS H等效角宽进行独立灵敏度或Monte Carlo分析。','setup':{'距离':'探测器全局Z，相对Z=0；用户已核对','执行目标':'独立CopySystem','模式':config['analysis']['mode'],'补偿方法':config['analysis']['method']}}
                if custom:config['report'].update(title='Tx 自定义MC与末样本补偿',background='使用脚本生成独立盲装误差，采集两颗die探测器光斑，并仅补偿最后MC状态。',objective='给出名义目标、MC散点、末样本补偿前后与终点局部灵敏度；保存最终副本。')
                import yaml
                if body.get('inputYaml') is not None:
                    from .config_io import parse_config
                    raw=body['inputYaml'].encode('utf-8')
                    if parse_config(raw,'.yaml')!=body['config']:raise OpticsError('TX_CONFIG','YAML原文与配置不一致')
                else:raw=yaml.safe_dump(body['config'],allow_unicode=True,sort_keys=False).encode('utf-8')
                b=RunBundle.create(self.root,'tx-custom' if custom else 'tx-native',config,runtime=rt,source='input.yaml',source_bytes=raw,mode='execute')
                for f in ('tx_native.py','tx_jobs.py','connection.py','capture.py','domain.py','model_checks.py','run_bundle.py','reporting.py','tx_native_report.py'):
                    b.copy(Path(__file__).with_name(f),'code/'+f)
                if custom:
                    for f in ('tx_custom.py','tx_custom_math.py','tx_custom_report.py'):b.copy(Path(__file__).with_name(f),'code/'+f)
                b.copy(self.root/'packages/optics/scripts/tx-native-worker.py','code/tx-native-worker.py')
                job={'id':str(uuid.uuid4()),'requestId':rid,'requestHash':sig,'status':'queued','mode':config['analysis']['mode'],'modelId':config['modelId'],'revision':config['expectedRevision'],'stage':'排队','progress':None,'run':str(b.path),'createdAt':time.time()}
                self.jobs.append(job);self.active=job['id'];self.persist()
                threading.Thread(target=self._run,args=(job,),daemon=True).start()
                return {'job':deepcopy(job)}
            except Exception:
                self.bridge.capture_lock.release();raise
    def _run(self,job):
        p=Path(job['run'])
        try:
            with self.lock:job['status']='running';self.persist()
            with (p/'worker.log').open('w',encoding='utf-8') as log:
                process=subprocess.Popen([str(self.root/self.bridge.config['python']),'-X','utf8',str(self.root/'packages/optics/scripts/tx-native-worker.py'),str(p)],cwd=self.root,stdout=log,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                process.wait() # the worker owns cancellation and cleanup, never kill its host
            result=json.loads((p/'result.json').read_text(encoding='utf-8')) if (p/'result.json').exists() else {'status':'failed','error':'执行进程未产生结果；请核对worker.log和Zemax工具'}
            with self.lock:job.update(status=result['status'],stage='已结束',error=result.get('error'),finishedAt=time.time())
        except Exception as e:
            with self.lock:job.update(status='failed',error=str(e))
        finally:
            with self.lock:self.active=None;self.persist()
            self.bridge.capture_lock.release()
    def cancel(self,body):
        with self.lock:
            for j in self.jobs:
                if j['id']==body.get('id'):
                    if j['status'] in ('running','queued','cancelling'):
                        (Path(j['run'])/'cancel.request').write_text('user requested cancellation',encoding='utf-8');j['status']='cancelling';self.persist()
                    return {'job':deepcopy(j)}
            raise OpticsError('NOT_FOUND','运行ID不存在')
