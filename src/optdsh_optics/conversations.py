"""Local durable conversation registry; DSH remains the transcript owner."""
import json
from pathlib import Path
import uuid
from datetime import datetime,timezone
from .domain import OpticsError

class ConversationStore:
    def __init__(self,root):
        self.path=Path(root)/'.runtime/optics-conversations.json'
        self.conversations={};self.jobs={}
        if self.path.exists():
            data=json.loads(self.path.read_text(encoding='utf-8'))
            self.conversations=data.get('conversations',{});self.jobs=data.get('jobs',{})
            for job in self.jobs.values():
                if job['status']=='running':
                    job.update(status='interrupted',error='服务重启中断；未自动重发。请新建会话继续。')
                    conv=self.conversations.get(job.get('conversationId'))
                    if conv:conv['needsRecovery']=True
            self.save()
    def create(self):
        key=str(uuid.uuid4());conv={'id':key,'title':'新会话','sessionId':'session-'+str(uuid.uuid4()),'resumeReady':False,'needsRecovery':False,'lastRequest':None,'createdAt':datetime.now(timezone.utc).isoformat()}
        self.conversations[key]=conv;self.save();return conv
    def get(self,key):
        if key not in self.conversations:raise OpticsError('CONVERSATION_NOT_FOUND','Unknown conversation')
        return self.conversations[key]
    def save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True);temporary=self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'version':1,'conversations':self.conversations,'jobs':self.jobs},ensure_ascii=False),encoding='utf-8');temporary.replace(self.path)
