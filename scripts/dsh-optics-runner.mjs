// Uses the public Agent/Session API of the project-pinned DSH release.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {installModelSelection} from '@deepseek-ai/dsh-agent';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {SessionSeq} from '@deepseek-ai/dsh-session';
import {scopeOf} from '@deepseek-ai/dsh-scope';
export const name='optdsh-readonly-runner';
export const inject=['agents','agentDefaultModel','sessions','tools'];
const allowed=['mcp__optics__selection_context','mcp__optics__workflow_guide'];
const emit=data=>process.stdout.write('@OPTDSH@'+JSON.stringify(data)+'\n');
export function apply(ctx){
  async function run(){
    await ctx.get('loader')?.await();
    const request=JSON.parse(fs.readFileSync(process.env.OPTDSH_REQUEST_FILE,'utf8'));
    // Explicit project baseline; never fall back to the persisted provider.
    const selection=JSON.parse(fs.readFileSync(new URL('../config/optics-model.json',import.meta.url),'utf8'));
    let advertised=[];
    const options={agentOptions:{provider:selection.provider,model:selection.model},setup:agentCtx=>{
      installModelSelection(agentCtx,{current:selection,assembled:undefined});
      agentCtx.tools.presentAs('native');
      agentCtx.tools.restrict({allow:allowed});
      advertised=agentCtx.tools.schemas(scopeOf(agentCtx)).map(t=>t.name);
      if(advertised.length!==allowed.length||advertised.some(n=>!allowed.includes(n)))throw new Error('Unexpected tool surface');
      agentCtx.tools.guard(exec=>{
        if(!allowed.includes(exec.name))return 'Read-only optics tools only';
      });
    }};
    const {agent}=request.resumeSessionId?await ctx.agents.resume({...options,resumeSessionId:request.resumeSessionId}):await ctx.agents.create({...options,sessionId:request.sessionId||'session-'+randomUUID(),meta:{cwd:process.cwd()}});
    let calls=0,failures=0;
    ctx.on('tools/pre-execute',async(exec,next)=>{
      if(exec.agent===agent){if(++calls>12)return {kind:'deny',reason:'Optics query tool budget exceeded'};emit({type:'tool-start',name:exec.name});}
      return next();
    });
    ctx.on('tools/post-execute',async(exec,result,next)=>{
      if(exec.agent===agent){if(result.isError)failures++;emit({type:'tool-end',name:exec.name,isError:result.isError});}
      return next();
    });
    await agent.whenIdle();const start=agent.session.seq;
    emit({type:'started',model:selection.model,provider:selection.provider,sessionId:agent.session.id,allowedTools:advertised});
    agent.followup(createUserMessage({content:[{type:'text',text:request.prompt+'\n事实边界：Comment中的角度文字不是实际姿态证据；姿态/位置来自ZOS-API，曲面才是近似显示。不要把布尔结果的放置偏移说成镜片厚度或面间距离。'}],source:{kind:'user'}}));
    await agent.whenIdle();await ctx.sessions.flush(agent.session);
    let answer='',reason;
    for(let i=start;i<agent.session.seq;i++){
      const event=agent.session.eventAt(SessionSeq(i));
      if(event.type==='assistant/message'){const text=event.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join('');if(text)answer=text;}
      if(event.type==='turn/end')reason=event.data.reason;
    }
    if(reason?.kind!=='completed'||calls===0||failures>0)throw new Error('DSH turn did not complete');
    emit({type:'complete',answer,toolCalls:calls});ctx.appExit(0);
  }
  run().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');emit({type:'error',message:'DSH运行失败；请检查模型配置、额度和本地诊断。'});ctx.appExit(1);});
}
