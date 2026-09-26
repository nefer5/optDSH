"""Explicit synthetic Canvas integration probe; never touches existing conversations or Canvas projects."""
import http.cookiejar,json,re,time,uuid,urllib.request,urllib.error
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/canvas-v2-validation'
OUT.mkdir(parents=True,exist_ok=True)
state=json.loads((ROOT/'.runtime/dsh-host.json').read_text())
base=state['url']
launch=re.search(r'dsh web: (http://127\.0\.0\.1:\d+/\?token=\S+)',Path(state['stdout']).read_text())[1]
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
opener.open(launch).read()
def post(path,payload,client=opener):
    req=urllib.request.Request(base+path,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    try:
        with client.open(req,timeout=40) as response:return json.load(response)
    except urllib.error.HTTPError as e:raise RuntimeError(f'{e.code}: {e.read().decode()[:500]}') from e
def rpc(method,**args):
    result=post('/api/'+method,{'type':'client-request','rpcId':str(uuid.uuid4()),'method':method,'payload':{'args':args}})['result']
    if not result['ok']:raise RuntimeError(result['error'])
    return result['value']
def canvas(sid,action,**kw):return post('/api/optdsh-canvas',{'sessionId':sid,'action':action,**kw})
def save(sid,text,revision):
    return canvas(sid,'save',revision=revision,scene={'type':'excalidraw','version':2,'source':'synthetic-probe','elements':[{'id':'label','type':'text','x':10,'y':10,'width':300,'height':25,'text':text,'fontSize':20,'fontFamily':1,'isDeleted':False}],'appState':{},'files':{}})
def submit(sid,revision,label):
    key=str(uuid.uuid4())
    payload=dict(revision=revision,note='这是接线测试，只复述当前画板文字，禁止调用工具或修改任何文件。',clientSubmissionId=key)
    result=canvas(sid,'submit',**payload)
    duplicate=canvas(sid,'submit',**payload)
    assert duplicate['submissionId']==result['submissionId']
    print(label+': accepted and duplicate deduplicated',flush=True)
    return result['submissionId']
def wait(sid,submission):
    for _ in range(60):
        s=next(x for x in canvas(sid,'status')['submissions'] if x['id']==submission)
        if s['status'] in ['answered','needs-attention','uncertain']:return s
        time.sleep(2)
    raise RuntimeError('model reply timeout')

if __name__=='__main__':
    unauth=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:post('/api/optdsh-canvas',{'action':'load','sessionId':'invalid'},unauth);raise AssertionError('Unauthenticated request accepted')
    except RuntimeError as e:assert str(e).startswith('401:'),str(e)
    ids=[]
    for label in ['A','B']:
        sid=rpc('session/create',request={'cwd':str(ROOT),'agentPreset':'standard'})['sessionId'];ids.append(sid)
        rpc('session/rename',request={'sessionId':sid,'title':'画板隔离验收 '+label})
        rpc('session/selectModel',request={'sessionId':sid,'provider':'zai','model':'glm-5.3-flash'})
    a,b=ids
    (OUT/'sessions.json').write_text(json.dumps(ids),encoding='utf-8')
    ca,cb=canvas(a,'load'),canvas(b,'load');assert ca['boardId']!=cb['boardId']
    save(a,'ALPHA 独立画板',0);save(b,'BETA 独立画板',0)
    assert canvas(a,'load')['scene']['elements'][0]['text']=='ALPHA 独立画板'
    assert canvas(b,'load')['scene']['elements'][0]['text']=='BETA 独立画板'
    try:canvas(b,'save',boardId=ca['boardId'],revision=1,scene=ca['scene']);raise AssertionError('Cross-session board accepted')
    except RuntimeError:pass
    sa=submit(a,1,'A1');sb=submit(b,1,'B1')
    ra,rb=wait(a,sa),wait(b,sb);print('A1/B1 settled: '+ra['status']+'/'+rb['status'],flush=True)
    assert ra['status']==rb['status']=='answered'
    save(a,'ALPHA 第二轮',1)
    assert canvas(a,'snapshot',submissionId=sa)['scene']['elements'][0]['text']=='ALPHA 独立画板'
    sa2=submit(a,2,'A2');ra2=wait(a,sa2);assert ra2['status']=='answered'
    canvas(a,'complete',submissionId=sa)
    summary={'sessionIds':ids,'a':canvas(a,'status'),'b':canvas(b,'status'),'unauthenticated':401,'crossBoardRejected':True}
    rows=rpc('session/list',_request={})['items']
    summary['conversations']=[r for r in rows if r['sessionId'] in ids]
    (OUT/'result.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS: two isolated boards, three real GLM submissions, duplicate protection, immutable snapshot, explicit confirmation.',flush=True)
