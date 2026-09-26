"""Explicit read-only end-to-end probe for the shared workbench session."""
import json,re,http.cookiejar,urllib.request,urllib.error,time,uuid,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=Path((ROOT/'artifacts/workbench-validation-run.txt').read_text().strip())
state=json.loads((ROOT/'.runtime/dsh-host.json').read_text());base=state['url']
launch=re.search(r'dsh web: (http://127\.0\.0\.1:\d+/\?token=\S+)',Path(state['stdout']).read_text())[1]
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));opener.open(launch).read()
def post(path,data):
 req=urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
 try:return json.load(opener.open(req,timeout=40))
 except urllib.error.HTTPError as e:raise RuntimeError(str(e.code)+': '+e.read().decode()[:700])
def wb(action,**data):return post('/api/optdsh-workbench',{'action':action,**data})
def rpc(method,**args):
 r=post('/api/'+method,{'type':'client-request','rpcId':str(uuid.uuid4()),'method':method,'payload':{'args':args}})['result']
 if not r['ok']:raise RuntimeError(r['error'])
 return r['value']
def wait(sid,previous):
 for _ in range(60):
  h=wb('history',sessionId=sid)
  if len([m for m in h['messages'] if m['role']=='assistant'])>previous and not h['running']:return h
  time.sleep(2)
 raise RuntimeError('Timed out waiting for answer')
if __name__=='__main__':
 sid=json.loads((OUT/'session.json').read_text())['sessionId']
 view=wb('optics',path='/api/snapshot',method='GET');assert not view['error'];s=view['snapshot'];model=Path(s['sourceFile']);before=hashlib.sha256(model.read_bytes()).hexdigest()
 objects=[o for o in s['objects'] if o['sourceIndex'] in (7,11)];assert len(objects)==2
 refs=[{'modelId':s['modelId'],'revision':s['revision'],'objectId':o['objectId'],'label':o['label']} for o in objects]
 request={'sessionId':sid,'requestId':'optics-'+str(uuid.uuid4()),'modelId':s['modelId'],'revision':s['revision'],'references':refs,'question':'这是只读接线验收。请记住本轮代号“共同会话A”，调用object_info核对这两个对象的类型和世界位置，简短回答；不得修改任何文件或模型。'}
 result=wb('submit',**request);assert wb('submit',**request)['requestId']==result['requestId'];print('workbench submit + duplicate accepted',flush=True)
 h1=wait(sid,0);print('workbench answer: '+h1['messages'][-1]['text'][:220],flush=True)
 bad={**request,'question':'changed'}
 try:wb('submit',**bad);raise AssertionError('Changed duplicate accepted')
 except RuntimeError as e:assert 'REQUEST_CONFLICT' in str(e)
 stale={**request,'requestId':'optics-'+str(uuid.uuid4()),'revision':'stale'}
 try:wb('submit',**stale);raise AssertionError('Stale reference accepted')
 except RuntimeError as e:assert 'STALE_REVISION' in str(e)
 rpc('session/prompt',request={'sessionId':sid,'requestId':'native-'+str(uuid.uuid4()),'mode':'queue','content':[{'type':'text','text':'从完整DSH界面继续本次验收：上一轮我要求记住的代号是什么？只回复该代号，不调用工具。'}]})
 h2=wait(sid,1);assert '共同会话A' in h2['messages'][-1]['text'];print('official API follow-up preserved memory',flush=True)
 c=post('/api/optdsh-canvas',{'action':'load','sessionId':sid});assert c['scene'] is None
 scene={'type':'excalidraw','version':2,'elements':[{'id':'probe-label','type':'text','x':10,'y':10,'width':250,'height':28,'text':'画板同会话验证 B','fontSize':20,'fontFamily':1,'isDeleted':False}],'appState':{},'files':{}}
 saved=post('/api/optdsh-canvas',{'action':'save','sessionId':sid,'revision':c['revision'],'scene':scene})
 submitted=post('/api/optdsh-canvas',{'action':'submit','sessionId':sid,'revision':saved['revision'],'clientSubmissionId':str(uuid.uuid4()),'note':'请只复述本画板文字和前面记住的共同会话代号，不修改任何内容。'})
 h3=wait(sid,2);assert '共同会话A' in h3['messages'][-1]['text'];print('canvas submission appeared in same history',flush=True)
 after=hashlib.sha256(model.read_bytes()).hexdigest();assert before==after
 evidence={'sessionId':sid,'workbench':h1,'officialFollowup':h2,'canvas':h3,'boardId':saved['boardId'],'duplicateVerified':True,'staleRejected':True,'modelSha256Before':before,'modelSha256After':after,'submission':submitted['submissionId']}
 (OUT/'integration.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8');print('PASS: 3 turns, same official session, same board, original model file unchanged',flush=True)
