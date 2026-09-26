"""Synthetic real-model test of project Canvas tools; leaves user boards untouched."""
import json,runpy,time,uuid
from pathlib import Path

v=runpy.run_path(str(Path(__file__).with_name('validate-canvas-http.py')),run_name='helpers')
rpc,canvas=v['rpc'],v['canvas']
out=Path(__file__).resolve().parents[1]/'artifacts/canvas-edit-validation';out.mkdir(parents=True,exist_ok=True)
sid=rpc('session/create',request={'cwd':str(v['ROOT']),'agentPreset':'standard'})['sessionId']
rpc('session/rename',request={'sessionId':sid,'title':'画板反向编辑验收'})
rpc('session/selectModel',request={'sessionId':sid,'provider':'zai','model':'glm-5.3-flash'})
board=canvas(sid,'load')
scene={'type':'excalidraw','version':2,'source':'synthetic','elements':[{'id':'original-rectangle','type':'rectangle','x':100,'y':100,'width':120,'height':80,'angle':0,'isDeleted':False}],'appState':{},'files':{}}
canvas(sid,'save',revision=0,scene=scene)
(out/'session.json').write_text(json.dumps({'sessionId':sid}),encoding='utf8')
rpc('session/prompt',request={'sessionId':sid,'requestId':str(uuid.uuid4()),'mode':'queue','content':[{'type':'text','text':
 '请使用本项目的optdsh-canvas技能，在本会话画板原矩形右边画一个蓝色圆形，再加文字“Agent回画测试”。保留原矩形。生成建议稿供我预览；这是合成画图测试，不涉及光学模型，不要调用光学工具或访问CLI。'}]})
print('GLM draw request admitted to isolated conversation',flush=True)
for i in range(90):
    b=canvas(sid,'status')
    rows=rpc('session/list',_request={})['items'];row=next(x for x in rows if x['sessionId']==sid)
    if b['edits'] and not row['running']:break
    if i and i%15==0:print('Waiting for native canvas tool call...',flush=True)
    time.sleep(2)
else:
    (out/'failure.json').write_text(json.dumps({'board':b,'session':row},ensure_ascii=False,indent=2),encoding='utf8')
    raise RuntimeError('No settled edit proposal; inspect failure.json')
proposal=b['edits'][-1]
current=canvas(sid,'load');assert current['scene']==scene,'Proposal changed original before approval'
preview=canvas(sid,'preview_edit',proposalId=proposal['id']);types=[e['type'] for e in preview['scene']['elements'] if not e.get('isDeleted')]
assert 'ellipse' in types and 'text' in types,types
applied=canvas(sid,'apply_edit',proposalId=proposal['id'],revision=current['revision'])
assert applied['revision']==2 and applied['scene']['elements'][0]==scene['elements'][0]
again=canvas(sid,'apply_edit',proposalId=proposal['id'],revision=1);assert again['revision']==2
other=rpc('session/create',request={'cwd':str(v['ROOT']),'agentPreset':'standard'})['sessionId']
try:canvas(other,'preview_edit',proposalId=proposal['id']);raise AssertionError('Proposal crossed session boundary')
except RuntimeError:pass
through=row['projections']['asOfSeq']
history=rpc('session/page',request={'address':{'kind':'session','sessionId':sid},'throughSeq':through,'maxMessages':100})
(out/'result.json').write_text(json.dumps({'sessionId':sid,'proposal':proposal,'applied':applied,'history':history,'summary':row,'crossSessionRejected':True},ensure_ascii=False,indent=2),encoding='utf8')
print('PASS: real GLM proposed ellipse+text; original untouched until explicit apply; applied once; cross-session rejected.',flush=True)
