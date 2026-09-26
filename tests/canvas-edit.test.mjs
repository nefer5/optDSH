import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BoardStore} from '../plugins/optdsh-agent-canvas/lib/boards.js';
import {editScene} from '../plugins/optdsh-agent-canvas/lib/drawing.js';
import {registerCanvasTools} from '../plugins/optdsh-agent-canvas/lib/tools.js';
function fixture(){const s=new BoardStore(mkdtempSync(join(tmpdir(),'canvas-edit-'))),b=s.board('session-a');s.save(b,{type:'excalidraw',elements:[{id:'original',type:'ellipse',x:10,y:20,width:100,height:80}],appState:{},files:{}},0);return {s,b};}
const input=()=>({baseRevision:1,summary:'增加测试标注',operations:[{op:'add',type:'text',x:200,y:20,text:'Agent标注',strokeColor:'#1971c2'}]});
test('proposal can be previewed without changing original and persists across restart',()=>{
  const {s,b}=fixture(),before=JSON.stringify(b.scene),p=s.proposeEdit(b,input(),'call-a');
  assert.equal(JSON.stringify(b.scene),before);assert.equal(b.revision,1);assert.equal(s.previewEdit(b,p.id).scene.elements.length,2);
  const restored=new BoardStore(s.root),rb=restored.board('session-a');assert.equal(restored.previewEdit(rb,p.id).proposal.summary,'增加测试标注');
});
test('apply explicit proposal once and preserve original elements',()=>{
  const {s,b}=fixture(),p=s.proposeEdit(b,input(),'a');const original=structuredClone(b.scene.elements[0]);
  s.applyEdit(b,p.id,1);assert.equal(b.revision,2);assert.deepEqual(b.scene.elements[0],original);assert.equal(b.scene.elements[1].text,'Agent标注');
  s.applyEdit(b,p.id,1);assert.equal(b.revision,2);
});
test('user edit after proposal blocks stale overwrite',()=>{const {s,b}=fixture(),p=s.proposeEdit(b,input(),'a');s.save(b,{...b.scene,elements:[...b.scene.elements,{id:'human',type:'rectangle'}]},1);assert.throws(()=>s.applyEdit(b,p.id,2),e=>e.code==='SCENE_CONFLICT');assert.equal(b.scene.elements[1].id,'human');});
test('proposal cannot cross conversations and rejected proposal cannot apply',()=>{const {s,b}=fixture(),p=s.proposeEdit(b,input(),'a'),other=s.board('b');assert.throws(()=>s.applyEdit(other,p.id,0));s.rejectEdit(b,p.id);assert.throws(()=>s.applyEdit(b,p.id,1));});
test('partial invalid patch does not alter canvas or persist proposal',()=>{const {s,b}=fixture(),before=JSON.stringify(b);assert.throws(()=>s.proposeEdit(b,{...input(),operations:[{op:'update',id:'original',x:20},{op:'delete',id:'missing'}]},'a'));assert.equal(JSON.stringify(b),before);});
test('user and locked elements are editable while arbitrary URL fields remain rejected',()=>{
  for(const props of [{locked:true},{boundElements:[{id:'label',type:'text'}]}])assert.equal(editScene({elements:[{id:'a',type:'rectangle',...props}]},[{op:'delete',id:'a'}]).scene.elements[0].isDeleted,true);
  assert.throws(()=>editScene(null,[{op:'add',type:'rectangle',x:0,y:0,link:'https://example.com'}]));
});
function linkedScene(){return {type:'excalidraw',elements:[
  {id:'box',type:'rectangle',x:100,y:100,width:100,height:80,angle:0,boundElements:[{id:'label',type:'text'},{id:'edge',type:'arrow'}]},
  {id:'label',type:'text',containerId:'box',text:'方2',fontSize:16,x:120,y:130,width:60,height:20,angle:0},
  {id:'edge',type:'arrow',x:200,y:140,width:200,height:0,angle:0,points:[[0,0],[200,0]],startBinding:{elementId:'box'},endBinding:null}
],appState:{},files:{}};}
test('move original labelled box without duplication, label and arrow follow',()=>{
  const {scene}=editScene(linkedScene(),[{op:'update',id:'box',y:250}]);assert.equal(scene.elements.length,3);
  const [box,label,edge]=scene.elements;assert.equal(box.id,'box');assert.equal(box.y,250);assert.equal(label.y,280);assert.equal(label.containerId,'box');
  assert.deepEqual([edge.x+edge.points[0][0],edge.y+edge.points[0][1]],[200,290]);
  assert.deepEqual([edge.x+edge.points[1][0],edge.y+edge.points[1][1]],[400,140]);
});
test('resize and rotate container moves label around its new center',()=>{
  const {scene}=editScene(linkedScene(),[{op:'update',id:'box',width:200,height:160,angle:Math.PI/2}]);
  const label=scene.elements[1];assert.ok(Math.abs(label.x+label.width/2-200)<1e-8);assert.ok(Math.abs(label.y+label.height/2-180)<1e-8);
});
test('change bound text through owner ID retains identity',()=>{const {scene}=editScene(linkedScene(),[{op:'update',id:'box',text:'已修改'}]);assert.equal(scene.elements[1].id,'label');assert.equal(scene.elements[1].text,'已修改');assert.equal(scene.elements[1].containerId,'box');});
test('delete container deletes its label and detaches arrow without deleting other drawing',()=>{const {scene}=editScene(linkedScene(),[{op:'delete',id:'box'}]);assert.equal(scene.elements[0].isDeleted,true);assert.equal(scene.elements[1].isDeleted,true);assert.equal(scene.elements[2].startBinding,null);assert.notEqual(scene.elements[2].isDeleted,true);});
test('rejection feedback is durable and idempotent, does not change scene',()=>{const {s,b}=fixture(),p=s.proposeEdit(b,input(),'a'),before=JSON.stringify(b.scene);s.rejectEdit(b,p.id,'向下移动，不要复制');const request=p.feedbackRequestId;s.rejectEdit(b,p.id,'向下移动，不要复制');assert.equal(p.feedbackRequestId,request);assert.equal(JSON.stringify(b.scene),before);assert.throws(()=>s.rejectEdit(b,p.id,'不同意见'));const restored=new BoardStore(s.root).board('session-a');assert.equal(restored.edits[0].feedback,'向下移动，不要复制');assert.equal(restored.edits[0].feedbackDelivery,'uncertain');});
test('draw primitives have renderable coordinates and stable IDs; update/delete target exact element',()=>{
  const {scene}=editScene(null,[{op:'add',type:'arrow',x:100,y:100,endX:20,endY:60},{op:'add',type:'rectangle',x:0,y:0,width:80,height:50}]);
  assert.deepEqual(scene.elements[0].points,[[80,40],[0,0]]);
  const id=scene.elements[1].id,r=editScene(scene,[{op:'update',id,x:200,strokeColor:'#f00'},{op:'delete',id:scene.elements[0].id}]);
  assert.equal(r.scene.elements[1].id,id);assert.equal(r.scene.elements[1].x,200);assert.equal(r.scene.elements[0].isDeleted,true);assert.equal(scene.elements[0].isDeleted,false);
});
test('native tools derive session from exact execution agent, never from model arguments',async()=>{
  const {s,b}=fixture(),defs=[],agent={id:'session-a',session:{id:'session-a'}};
  const ctx={agents:{get:id=>id===agent.id?agent:null},tools:{register:d=>defs.push(d)}};
  registerCanvasTools(ctx,s,async sid=>s.board(sid));const exec={agent,signal:new AbortController().signal,callId:'tool-call'};
  const read=await defs.find(d=>d.name==='canvas_read').execute({},exec);assert.equal(read.revision,1);
  const result=await defs.find(d=>d.name==='canvas_propose_edit').execute(input(),exec);assert.equal(result.status,'proposed');assert.equal(b.scene.elements.length,1);
  await assert.rejects(()=>defs[0].execute({},{...exec,agent:{id:'session-a',session:{id:'session-a'}}}));
});
