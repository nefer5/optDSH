import {mkdirSync, readFileSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {editScene} from './drawing.js';

const hash = (s) => createHash('sha256').update(s).digest('hex');
export function requireValue(ok, message, code = 'INVALID_INPUT') {
  if (!ok) throw Object.assign(new Error(message), {code});
}
export function validateScene(scene) {
  requireValue(scene?.type === 'excalidraw' && Array.isArray(scene.elements) && scene.elements.length <= 10000, 'Invalid canvas scene');
  requireValue(Buffer.byteLength(JSON.stringify(scene)) <= 5_000_000, 'Canvas exceeds 5 MB');
  return structuredClone(scene);
}
export function sceneContext(scene, note) {
  const live = scene.elements.filter(e => !e.isDeleted);
  return {note: String(note || '').slice(0, 4000), truncated: live.length > 150,
    unsupportedVisualElements: live.filter(e => ['image', 'freedraw'].includes(e.type)).length,
    elements: live.slice(0, 150).map(e => ({...Object.fromEntries(Object.entries(e).filter(([k]) =>
      ['id','type','x','y','width','height','angle','groupIds','startBinding','endBinding','text','strokeColor','backgroundColor','fontSize','strokeWidth','locked','containerId','boundElements'].includes(k)
    ).map(([k,v]) => [k, k === 'text' ? String(v).slice(0,600) : v])),
      ...(['arrow','line'].includes(e.type)?{points:(e.points||[]).slice(0,20)}:{})})),
    interpretation: '草图是用户意图，不是光学事实；图片和手绘像素未解析。'};
}

// Framework-independent durable board store. Existing Canvas project files are never touched.
export class BoardStore {
  constructor(root) { this.root = root; this.cache = new Map(); this.cursors=new Map(); mkdirSync(root, {recursive:true}); }
  board(sessionId) {
    requireValue(typeof sessionId === 'string' && /^[\w-]{1,160}$/.test(sessionId), 'Invalid session identity');
    if (this.cache.has(sessionId)) return this.cache.get(sessionId);
    const boardId = 'board-' + hash(sessionId).slice(0,32);
    let b;
    try { b = JSON.parse(readFileSync(join(this.root, boardId + '.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (b) requireValue(b.sessionId === sessionId && b.boardId === boardId && b.schema === 1, 'Corrupt board binding');
    else b = {schema:1, boardId, sessionId, revision:0, scene:null, submissions:[], updatedAt:null};
    b.edits ||= [];
    for(const p of b.edits)if(p.feedbackDelivery==='accepting')p.feedbackDelivery='uncertain';
    for (const s of b.submissions) if (['accepting','queued','running'].includes(s.status)) s.status = 'uncertain';
    this.cache.set(sessionId,b); this.persist(b); return b;
  }
  persist(b) {
    const target=join(this.root,b.boardId+'.json'), temp=target+'.tmp';
    writeFileSync(temp,JSON.stringify(b),'utf8'); renameSync(temp,target);
  }
  public(b, includeScene=false) {
    return {boardId:b.boardId,sessionId:b.sessionId,revision:b.revision,updatedAt:b.updatedAt,
      ...(includeScene ? {scene:b.scene} : {}),submissions:b.submissions.map(({snapshot,...s})=>s),edits:b.edits};
  }
  save(b, scene, revision) {
    scene=validateScene(scene);
    if (revision !== b.revision) {
      const recoveryPath=join(this.root,`${b.boardId}-conflict-${randomUUID()}.json`);
      writeFileSync(recoveryPath,JSON.stringify(scene),'utf8');
      throw Object.assign(new Error('画板版本冲突；已保留冲突副本，请导出或重新打开后合并'),{code:'SCENE_CONFLICT',recoveryPath});
    }
    b.scene=scene; b.revision++; b.updatedAt=new Date().toISOString(); this.persist(b);
    return this.public(b);
  }
  prepare(b, input) {
    requireValue(typeof input.clientSubmissionId === 'string' && /^[\w-]{8,120}$/.test(input.clientSubmissionId),'Invalid submission identity');
    requireValue(typeof input.note === 'string' && input.note.length <= 4000,'Note exceeds 4000 characters');
    const contentHash=hash(JSON.stringify({revision:input.revision,note:input.note}));
    const existing=b.submissions.find(s=>s.clientSubmissionId===input.clientSubmissionId);
    if (existing) {requireValue(existing.contentHash===contentHash,'Submission identity reused with different content');return {submission:existing,fresh:false};}
    requireValue(b.scene && b.scene.elements.some(e=>!e.isDeleted),'画板为空');
    requireValue(input.revision === b.revision,'画板已更新，请保存后重新提交','SCENE_CONFLICT');
    const id='canvas-'+hash(b.boardId+':'+input.clientSubmissionId).slice(0,40);
    const snapshot=structuredClone(b.scene);
    const s={id,clientSubmissionId:input.clientSubmissionId,contentHash,sceneHash:hash(JSON.stringify(snapshot)),
      revision:b.revision,note:input.note,status:'accepting',createdAt:new Date().toISOString()};
    // Snapshots do not get rewritten by every autosave or status transition.
    writeFileSync(join(this.root,b.boardId+'-'+s.id+'.snapshot.json'),JSON.stringify(snapshot),{encoding:'utf8',flag:'wx'});
    b.submissions.push(s);this.persist(b);return {submission:s,fresh:true};
  }
  snapshot(b,s) {
    // Retain compatibility with early v2 probe files, without touching their data.
    return s.snapshot || JSON.parse(readFileSync(join(this.root,b.boardId+'-'+s.id+'.snapshot.json'),'utf8'));
  }
  proposeEdit(b,input,callId) {
    requireValue(Number.isSafeInteger(input.baseRevision)&&input.baseRevision===b.revision,'画板版本已变化，请重新canvas_read再提案','SCENE_CONFLICT');
    requireValue(typeof input.summary==='string'&&input.summary.length>0&&input.summary.length<=1000,'Summary must contain 1–1000 characters');
    const contentHash=hash(JSON.stringify(input));
    const old=b.edits.find(x=>x.contentHash===contentHash&&x.status==='proposed');if(old)return old;
    const {scene,changed}=editScene(b.scene,input.operations);validateScene(scene);
    const proposal={id:'edit-'+randomUUID(),baseRevision:b.revision,summary:input.summary,status:'proposed',changed,
      contentHash,callId:String(callId),createdAt:new Date().toISOString()};
    writeFileSync(join(this.root,b.boardId+'-'+proposal.id+'.json'),JSON.stringify({before:b.scene,after:scene}),{flag:'wx'});
    b.edits.push(proposal);this.persist(b);return proposal;
  }
  previewEdit(b,id) {
    const p=b.edits.find(x=>x.id===id);requireValue(p,'Unknown proposal');
    const saved=JSON.parse(readFileSync(join(this.root,b.boardId+'-'+p.id+'.json'),'utf8'));
    return {...this.public(b),scene:saved.after,proposal:p,readOnly:true};
  }
  applyEdit(b,id,revision) {
    const p=b.edits.find(x=>x.id===id);requireValue(p,'Unknown proposal');
    if(p.status==='applied')return this.public(b,true);
    requireValue(p.status==='proposed','Proposal is no longer pending');
    requireValue(revision===b.revision&&p.baseRevision===b.revision,'画板在提案后发生变化，请让Agent基于最新画板重新生成','SCENE_CONFLICT');
    const preview=this.previewEdit(b,id);const scene=validateScene(preview.scene);
    b.scene=scene;b.revision++;b.updatedAt=new Date().toISOString();p.status='applied';p.appliedRevision=b.revision;
    this.persist(b);return this.public(b,true);
  }
  rejectEdit(b,id,feedback='') {
    requireValue(typeof feedback==='string'&&feedback.length<=4000,'反馈最多4000字');feedback=feedback.trim();
    const p=b.edits.find(x=>x.id===id);requireValue(p,'Unknown proposal');
    if(p.status==='rejected') {requireValue((p.feedback||'')===feedback,'该建议已拒绝，不能覆盖之前的反馈');return this.public(b);}
    requireValue(p.status==='proposed','No pending proposal');
    p.status='rejected';p.feedback=feedback;
    if(feedback){p.feedbackRequestId='canvas-feedback-'+hash(b.boardId+':'+p.id).slice(0,32);p.feedbackDelivery='accepting';}
    this.persist(b);return this.public(b);
  }
  observe(sessionId,event) {
    const b=this.cache.get(sessionId);if(!b)return;
    const cursor=this.cursors.get(sessionId)||{seq:-1,turn:undefined};
    if(event.seq<=cursor.seq)return;
    cursor.seq=event.seq;
    if(event.type==='turn/start')cursor.turn=event.data.turn;
    this.cursors.set(sessionId,cursor);
    let dirty=false;
    for(const s of b.submissions) {
      if(s.status==='processed')continue;
      if(event.type==='user/message' && event.data.source?.rpcId===s.id) {s.turn=cursor.turn;s.status='running';dirty=true;}
      if(event.type==='turn/end' && s.turn!==undefined && s.turn===event.data.turn) {
        s.status=event.data.reason?.kind==='completed'?'answered':'needs-attention';
        s.reason=event.data.reason?.kind;dirty=true;
      }
    }
    if(dirty)this.persist(b);
  }
  complete(b,id) {
    const s=b.submissions.find(s=>s.id===id);requireValue(s,'Unknown submission');
    requireValue(['answered','processed'].includes(s.status),'尚无该提交的已完成回答，不能确认处理');
    s.status='processed';this.persist(b);return this.public(b);
  }
}
