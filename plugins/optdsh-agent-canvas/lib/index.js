import {dirname, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {requireValue, sceneContext} from './boards.js';
import {WorkspaceBoardStore} from './workspace-store.js';
import {registerCanvasTools} from './tools.js';
import {canvasMessage} from './messages.js';
import {canvasRuntimeOptions} from './config.js';
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem';

export const name = 'optdsh-agent-canvas';
export const inject = ['connection', 'sessionController', 'tools', 'agents', 'systemPrompt'];
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function apply(ctx, options={}) {
  options=canvasRuntimeOptions(options,process.env,ctx.get?.('profileContext'));
  const ROOT=resolve(options.stateRoot||options.projectRoot||process.cwd());
  if(options.enabled===false)return;
  if(ctx.plugin&&ctx.inject)ctx.inject(['skills'],scope=>scope.plugin(skillFilesystem,{providerName:'optdsh-canvas',includeDefaultRoots:false,bundledSkillDir:resolve(PACKAGE_ROOT,'skills')}));
  const editor=new URL(options.editorUrl||'http://127.0.0.1:4173');
  requireValue(['http:','https:'].includes(editor.protocol)&&!editor.username&&!editor.password&&editor.pathname==='/'&&!editor.search&&!editor.hash,'编辑器地址必须是无凭据的HTTP(S) origin');
  const store = new WorkspaceBoardStore({legacyRoot:options.legacyRoot||resolve(ROOT,'data/canvas/boards')});
  const stop = new AbortController();
  ctx.effect(() => () => stop.abort(), 'canvas shutdown');
  ctx.on('session/event',(session,event)=>store.observe(session.id,event));
  const active = new Set();
  const bindings=new Map(),workspaces=new Map();
  async function binding(sessionId) {
    const current=await ctx.sessionController.inspect(sessionId,stop.signal);
    requireValue(typeof current.meta.cwd==='string'&&current.meta.cwd.length>0,'会话缺少工作目录');
    const cwd=resolve(current.meta.cwd);
    requireValue(!workspaces.has(sessionId)||workspaces.get(sessionId)===cwd,'会话工作目录已改变，请重新打开插件核对画板归属','SESSION_WORKSPACE_CHANGED');
    workspaces.set(sessionId,cwd);
    if(!bindings.has(sessionId)) {
      const pending=(async()=>{
        const inspection=current;
        const b=store.board(sessionId,inspection.meta.cwd);
        for(const event of inspection.events)store.observe(b.sessionId,event);
        return b;
      })();
      bindings.set(sessionId,pending);
      pending.catch(()=>bindings.delete(sessionId));
    }
    return bindings.get(sessionId);
  }
  registerCanvasTools(ctx,store,binding);
  ctx.systemPrompt.section({name:'optdsh:canvas',order:80,text:
    '本项目官方Web会话画板已支持双向协作。用户要求画图/修改画板时，先canvas_read，再canvas_propose_edit。允许修改用户绘制的图形，包括带绑定文字的方框；移动必须update原ID，标签/箭头会联动，不能用复制代替移动。用户拒绝并给出反馈时，按意见重新读取并生成建议稿。工具自动绑定当前聊天；未应用前不得声称已改原图。正常回复只说明改动，不输出proposalId/revision、端口/协议或反复添加免责声明水印。不要使用旧agent-canvas CLI、inbox或扫描4173猜接口。图片/手绘像素未解析，画板坐标为px而非光学模型坐标；画板编辑不修改Zemax，光学分析执行另按对应Skill和授权流程处理。'});
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/optdsh-canvas/transport',methods:['GET'],requestBody:'buffered',fetch:async()=>new Response(readFileSync(resolve(PACKAGE_ROOT,'web/transport.js'),'utf8').replace("'http://127.0.0.1:4173'",JSON.stringify(editor.origin)),{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}})}),'shared canvas transport');
  ctx.effect(() => ctx.connection.fetch.register({
    path:'/api/optdsh-canvas', methods:['POST'], requestBody:'buffered',
    async fetch(request) {
      try {
        requireValue(!stop.signal.aborted,'Canvas bridge is stopping');
        requireValue(request.headers.get('content-type')?.startsWith('application/json'),'Expected JSON');
        const text=await request.text();requireValue(Buffer.byteLength(text)<=5_100_000,'Request exceeds canvas limit');
        const input=JSON.parse(text);
        requireValue(typeof input.sessionId==='string','Missing session identity');
        // Official authenticated carrier + persisted workspace ownership, before creating a binding.
        // Immutable workspace ownership is checked once per process. Live events update status.
        const b=await binding(input.sessionId);
        if(input.boardId!==undefined)requireValue(input.boardId===b.boardId,'Board does not belong to this session');
        let result;
        if(input.action==='load')result=store.public(b,true);
        else if(input.action==='status')result=store.public(b);
        else if(input.action==='save')result=store.save(b,input.scene,input.revision);
        else if(input.action==='preview_edit')result=store.previewEdit(b,input.proposalId);
        else if(input.action==='apply_edit')result=store.applyEdit(b,input.proposalId,input.revision);
        else if(input.action==='reject_edit') {
          const previous=b.edits.find(p=>p.id===input.proposalId);
          const wasRejected=previous?.status==='rejected';
          store.rejectEdit(b,input.proposalId,input.feedback||'');
          const p=b.edits.find(p=>p.id===input.proposalId);
          if(!wasRejected&&p.feedback){
            const task=(async()=>{
              try {
                await ctx.sessionController.prompt({sessionId:b.sessionId,requestId:p.feedbackRequestId,mode:'queue',
                  content:canvasMessage(p.feedback,{kind:'feedback',proposalId:p.id,summary:p.summary,revision:b.revision,
                    instruction:'用户拒绝了该建议稿。请根据修改意见重新读取当前画板，修改原有元素并生成新建议稿；不要用复制代替移动。'})},stop.signal);
                p.feedbackDelivery='queued';
              }catch(e){p.feedbackDelivery='uncertain';p.feedbackError=String(e.message||e);}
              store.persist(b);
            })();active.add(task);task.finally(()=>active.delete(task));await task;
          }
          result=store.public(b);
        }
        else if(input.action==='snapshot') {
          const s=b.submissions.find(s=>s.id===input.submissionId);requireValue(s,'Unknown snapshot');
          result={...store.public(b),scene:store.snapshot(b,s),revision:s.revision,readOnly:true};
        } else if(input.action==='complete')result=store.complete(b,input.submissionId);
        else if(input.action==='submit') {
          const {submission:s,fresh}=store.prepare(b,input);
          if(fresh) {
            const task=(async()=>{
              try {
                await ctx.sessionController.prompt({sessionId:b.sessionId,requestId:s.id,mode:'queue',content:
                  canvasMessage(s.note,{kind:'submission',submissionId:s.id,revision:s.revision,...sceneContext(store.snapshot(b,s),''),
                    instruction:'请在本会话继续讨论；画板是可协作修改的草稿。'})},stop.signal);
                if(s.status==='accepting')s.status='queued';
              } catch(e) {s.status='uncertain';s.error=String(e.message||e);}
              store.persist(b);
            })();
            active.add(task);task.finally(()=>active.delete(task));
            await task;
          }
          result={...store.public(b),submissionId:s.id,status:s.status};
        } else throw new Error('Unknown canvas action');
        return Response.json({...result,host:{name:'DSH',workspaceRoot:workspaces.get(input.sessionId),workspaceName:basename(workspaces.get(input.sessionId))}},{headers:{'Cache-Control':'no-store'}});
      } catch(e) {
        return Response.json({error:{code:e.code||'CANVAS_ERROR',message:e.message,recoveryPath:e.recoveryPath}},
          {status:400,headers:{'Cache-Control':'no-store'}});
      }
    }
  }), 'canvas authenticated API');
  ctx.effect(()=>async()=>{stop.abort();await Promise.allSettled([...active]);},'canvas admission drain');
}
