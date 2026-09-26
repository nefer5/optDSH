"""Explicit conversation-bound AgentCanvas receiver. Never sweeps shared inbox."""
import hashlib
import json
from pathlib import Path
import threading
import time
from urllib.request import Request,build_opener,ProxyHandler
from .domain import OpticsError

def scene_context(scene,note=''):
    items=[];unsupported=0
    for e in scene.get('elements',[]):
        if e.get('isDeleted'):continue
        if e.get('type') in ('image','freedraw'):unsupported+=1
        if len(items)<150:
            item={k:e[k] for k in ('id','type','x','y','width','height','angle','groupIds','startBinding','endBinding') if k in e}
            if e.get('text'):item['text']=e['text'][:600]
            items.append(item)
    return {'note':str(note)[:3000],'elements':items,'unsupportedVisualElements':unsupported,
            'truncated':len([e for e in scene.get('elements',[]) if not e.get('isDeleted')])>150,
            'interpretation':'文字、形状与显式连线；空间临近不等于物理关联。图像/手绘像素未解析。'}

class CanvasBridge:
    def __init__(self,jobs,root):
        self.jobs,self.root=jobs,Path(root);self.bindings={};self.opener=build_opener(ProxyHandler({}))
    def api(self,path,data=None,token=None,method=None):
        headers={'Content-Type':'application/json'}
        if token:headers['Authorization']='Bearer '+token
        req=Request('http://127.0.0.1:4173'+path,headers=headers,data=None if data is None else json.dumps(data).encode(),method=method)
        with self.opener.open(req,timeout=70) as response:return json.load(response)
    def connect(self,conversation_id):
        with self.jobs.lock:
            conv=self.jobs.store.get(conversation_id)
            if not conv.get('lastRequest'):raise OpticsError('NO_CONTEXT','先发送一次对象查询，再连接画板')
            if conv.get('needsRecovery'):raise OpticsError('CONVERSATION_INTERRUPTED','Create a new conversation first')
            if self.bindings.get(conversation_id,{}).get('active'):return self.status(conversation_id)
            project=json.loads((self.root/'.agent-canvas/project.json').read_text(encoding='utf-8'))
            if Path(project['rootPath']).resolve()!=self.root.resolve():raise OpticsError('MODEL_MISMATCH','Canvas project differs')
            state={'active':True,'status':'connecting','projectId':project['projectId'],'label':'optDSH · '+conv['title'][:32]+' · '+conversation_id[:6]}
            self.bindings[conversation_id]=state
            threading.Thread(target=self._wait,args=(conversation_id,state),daemon=True).start()
            return self.status(conversation_id)
    def status(self,key=None):
        return {k:{field:value for field,value in dict(state).items() if field not in ('token',)} for k,state in list(self.bindings.items()) if key is None or k==key}
    def stop(self,key):
        state=self.bindings.get(key)
        if state:
            state['active']=False;state['status']='disconnected'
            try:
                if state.get('receiverId'):self.api('/api/agent-sessions/'+state['receiverId'],token=state.get('token'),method='DELETE')
            except Exception:pass
        return self.status(key)
    def _wait(self,key,state):
        try:
            while state['active']:
                session=self.api('/api/agent-sessions',{'projectId':state['projectId'],'label':state['label'],'timeoutMs':60000})
                state.update(receiverId=session['id'],token=session['token'],status='waiting')
                if not state['active']:
                    self.api('/api/agent-sessions/'+session['id'],token=session['token'],method='DELETE');break
                decision=self.api('/api/agent-sessions/'+session['id']+'/wait',token=session['token'])
                if decision.get('decision')!='submitted':continue
                submission=decision['submissionId'];path=Path(decision['scenePath']).resolve();inbox=(self.root/'.agent-canvas/inbox').resolve()
                if not path.is_relative_to(inbox):raise ValueError('Canvas path outside project')
                if path.stat().st_size>5_000_000:raise ValueError('Canvas scene too large')
                scene=json.loads(path.read_text(encoding='utf-8'));context=scene_context(scene,decision.get('note',''))
                attachment={'submissionId':submission,'projectId':state['projectId'],'context':context,'status':'queued'}
                with self.jobs.lock:
                    conv=self.jobs.store.get(key);attachments=conv.setdefault('canvasAttachments',{})
                    if submission in attachments:continue
                    attachments[submission]=attachment;self.jobs.store.save()
                state.update(status='queued',lastSubmissionId=submission)
                while state['active']:
                    with self.jobs.lock:busy=any(j['status']=='running' for j in self.jobs.jobs.values())
                    if not busy:break
                    time.sleep(.5)
                if not state['active']:break
                try:
                    request={'requestId':'canvas-'+hashlib.sha256(submission.encode()).hexdigest()[:40],'conversationId':key,
                             'question':'请结合本会话已绑定的光学对象，阅读此次画板补充并继续讨论。明确哪些是用户意图，哪些需要核实；不修改模型。','canvasSubmissionId':submission}
                    job=self.jobs.submit(request)
                    with self.jobs.lock:attachment.update(status='submitted',jobId=job['id']);self.jobs.store.save()
                    state['status']='delivered'
                except OpticsError as e:
                    with self.jobs.lock:attachment.update(status='needs-attention',error=e.payload());self.jobs.store.save()
                    state.update(status='needs-attention',error=e.code)
        except Exception as e:state.update(status='error',active=False,error=type(e).__name__)
        finally:state.pop('token',None)
    def complete(self,key,submission):
        with self.jobs.lock:
            conv=self.jobs.store.get(key);attachment=conv.get('canvasAttachments',{}).get(submission)
            if not attachment:raise OpticsError('SUBMISSION_NOT_FOUND','Unknown bound canvas submission')
            job=self.jobs.jobs.get(attachment.get('jobId'),{})
            if job.get('status')!='completed':raise OpticsError('NOT_COMPLETED','No completed answer for this canvas')
            self.api('/api/submissions/'+submission+'/complete',{'projectId':attachment['projectId']})
            attachment['status']='processed';self.jobs.store.save()
            state=self.bindings.get(key,{})
            if state.get('lastSubmissionId')==submission:state.pop('lastSubmissionId',None)
            return {'status':'processed'}
