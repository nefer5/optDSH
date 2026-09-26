"""Synthetic labelled-shape move and rejection-feedback integration test."""
import json,runpy,time,uuid
from pathlib import Path
v=runpy.run_path(str(Path(__file__).with_name('validate-canvas-http.py')),run_name='helpers')
rpc,canvas=v['rpc'],v['canvas'];out=v['ROOT']/'artifacts/canvas-v4-validation';out.mkdir(parents=True,exist_ok=True)
sid=rpc('session/create',request={'cwd':str(v['ROOT']),'agentPreset':'standard'})['sessionId']
rpc('session/rename',request={'sessionId':sid,'title':'画板v4绑定移动与反馈验收'})
rpc('session/selectModel',request={'sessionId':sid,'provider':'zai','model':'glm-5.3-flash'})
scene={'type':'excalidraw','version':2,'source':'synthetic','elements':[
 {'id':'box','type':'rectangle','x':100,'y':100,'width':160,'height':100,'angle':0,'boundElements':[{'id':'label','type':'text'}]},
 {'id':'label','type':'text','x':150,'y':140,'width':60,'height':20,'fontSize':16,'fontFamily':2,'text':'方2','containerId':'box','angle':0}
],'appState':{},'files':{}}
canvas(sid,'save',revision=0,scene=scene)
(out/'session.json').write_text(json.dumps({'sessionId':sid}),encoding='utf8')
canvas(sid,'submit',revision=1,clientSubmissionId=str(uuid.uuid4()),note='请用optdsh-canvas技能把方2连同文字整体向下移动100px，修改原图，不要复制；生成建议稿。这是合成画图测试，不用光学工具。')
def wait_edits(count):
 for i in range(90):
  b=canvas(sid,'status');row=next(x for x in rpc('session/list',_request={})['items'] if x['sessionId']==sid)
  if len(b['edits'])>=count and not row['running']:return b,row
  if i and i%15==0:print('Waiting for model edit...',flush=True)
  time.sleep(2)
 raise RuntimeError('Proposal timeout')
print('First labelled-shape request sent',flush=True)
b,row=wait_edits(1);first=b['edits'][-1];preview=canvas(sid,'preview_edit',proposalId=first['id'])
elements={e['id']:e for e in preview['scene']['elements'] if not e.get('isDeleted')};assert len(elements)==2;assert elements['box']['y']==200;assert elements['label']['y']==240
assert canvas(sid,'load')['scene']==scene
feedback='修改意见：改为把原来的方2和文字一起向下移动150px（原方框y=100，目标y=250），不是100px。不要复制。请重新生成建议稿。'
r=canvas(sid,'reject_edit',proposalId=first['id'],feedback=feedback);again=canvas(sid,'reject_edit',proposalId=first['id'],feedback=feedback)
assert r['edits'][0]['feedbackRequestId']==again['edits'][0]['feedbackRequestId'];assert r['edits'][0]['feedbackDelivery']=='queued'
print('Rejection feedback admitted once',flush=True)
b,row=wait_edits(2);second=b['edits'][-1];p2=canvas(sid,'preview_edit',proposalId=second['id']);elements={e['id']:e for e in p2['scene']['elements'] if not e.get('isDeleted')}
assert len(elements)==2;assert elements['box']['y']==250;assert elements['label']['y']==290
applied=canvas(sid,'apply_edit',proposalId=second['id'],revision=1)
assert applied['scene']['elements'][0]['id']=='box';assert applied['scene']['elements'][1]['containerId']=='box'
history=rpc('session/page',request={'address':{'kind':'session','sessionId':sid},'throughSeq':row['projections']['asOfSeq'],'maxMessages':100})
(out/'result.json').write_text(json.dumps({'sessionId':sid,'first':first,'rejection':r,'second':second,'applied':applied,'history':history},ensure_ascii=False,indent=2),encoding='utf8')
print('PASS: original labelled shape moved without copy; feedback regenerated 150px move; correct session; applied.',flush=True)
