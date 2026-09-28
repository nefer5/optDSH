import {BlockAssembler,expandAssistantStream} from '@deepseek-ai/dsh-llm';
import {surfaceMessages} from './core.js';

// A presentation projection only. Official Session events remain authoritative.
export class SessionPresentation {
 constructor(sessionId){this.sessionId=sessionId;this.records=new Map();this.active=null;this.streamRevision=0;this.queue=[];this.projections={};this.hasMore=false;}
 accept(frame){
  if(frame.type==='snapshot'){
   this.records=new Map(frame.records.filter(r=>['user/message','assistant/message','assistant/attempt'].includes(r.event.type)).map(r=>[r.event.seq,r]));this.hasMore=frame.hasMore;this.projections=frame.projections?.values||{};
   this.streamRevision=frame.assistantStream?.revision||0;this.active=null;
   const a=frame.assistantStream?.activeAttempt;
   if(a){this.active={...a,assembler:new BlockAssembler()};for(const {chunk}of expandAssistantStream(a.stream))this.active.assembler.push(chunk);}
  }else if(frame.type==='event'){
   const e=frame.event;if(['user/message','assistant/message','assistant/attempt'].includes(e.type))this.records.set(e.seq,frame);
   if(this.records.size>240){this.records.delete(this.records.keys().next().value);this.hasMore=true;}
   if(this.active&&['assistant/message','assistant/attempt'].includes(e.type)&&e.data.turn===this.active.turn&&e.data.step===this.active.step)this.active=null;
  }else if(frame.type==='assistant-stream'){
   const f=frame.frame;
   if(f.type==='start'&&f.revision===1)this.streamRevision=0;
   if(f.revision<=this.streamRevision)return;
   if(f.revision!==this.streamRevision+1)throw new Error('Assistant stream gap; reconnect for authoritative baseline');
   this.streamRevision=f.revision;
   if(f.type==='start')this.active={...f,nextIndex:0,assembler:new BlockAssembler()};
   else if(f.type==='chunk'){
    const a=this.active;if(!a||a.attemptId!==f.attemptId||a.nextIndex!==f.index)throw new Error('Assistant chunk gap');
    a.assembler.push(f.chunk);a.nextIndex++;
   }else if(f.type==='end'&&(f.outcome.kind==='abandoned'||this.records.has(f.outcome.seq)))this.active=null;
  }
 }
 control(frame){
  if(frame.type==='baseline'){this.queue=frame.value.queues[this.sessionId]||[];Object.assign(this.projections,frame.value.projections[this.sessionId]?.values||{});}
  else if(frame.sessionId===this.sessionId){if(frame.type==='queue')this.queue=frame.items;else if(frame.type==='projection')this.projections[frame.key]=frame.value;}
 }
 snapshot(running=false){
  const messages=surfaceMessages([...this.records.values()].sort((a,b)=>a.event.seq-b.event.seq));
  if(this.active){const blocks=this.active.assembler.interruptedBlocks();messages.push({seq:'live:'+this.active.attemptId,role:'assistant',text:blocks.filter(b=>b.type==='text').map(b=>b.text).join(''),reasoning:blocks.filter(b=>b.type==='reasoning').map(b=>b.text).join(''),context:[],streaming:true});}
  const ids=new Set(messages.map(m=>m.requestId).filter(Boolean));
  const queue=this.queue.filter(q=>q.placement!=='context'&&!ids.has(q.rpcId)).map(q=>({seq:'queue:'+q.id,requestId:q.rpcId,role:'user',text:q.message.content.filter(b=>b.type==='text'&&!b.text.startsWith('<optdsh_')).map(b=>b.text).join('\n'),context:[],delivery:q.placement==='steering'?'插话待接收':'排队中'}));
  return {sessionId:this.sessionId,messages,queue,hasMore:this.hasMore,model:this.projections.modelSelection?.next,running:running||!!this.active};
 }
}

export function sessionFeed(ctx,sessionId,requestSignal,shutdownSignal){
 const cancel=new AbortController(),signal=AbortSignal.any([cancel.signal,requestSignal,shutdownSignal]);
 const state=new SessionPresentation(sessionId),encoder=new TextEncoder();let timer,heartbeat,controller,closed=false,ready=false;
 function close(){if(closed)return;closed=true;cancel.abort();clearTimeout(timer);clearInterval(heartbeat);try{controller.close();}catch{}}
 function send(name,value){if(!closed)controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`));}
 function flush(){timer=null;if(ready)send('state',state.snapshot(ctx.agents.get(sessionId)?.status==='running'));}
 function schedule(){if(!timer)timer=setTimeout(flush,40);}
 async function pump(iterable,accept){try{for await(const f of iterable){if(signal.aborted)break;accept(f);schedule();}}catch(e){if(!signal.aborted)send('sync-error',{message:e.message});}finally{if(!signal.aborted)close();}}
 const body=new ReadableStream({start(c){controller=c;signal.addEventListener('abort',close,{once:true});
  if(signal.aborted){close();return;}
  heartbeat=setInterval(()=>{if(!closed){controller.enqueue(encoder.encode(': keepalive\n\n'));schedule();}},10000);
  void pump(ctx.sessionController.follow({address:{kind:'session',sessionId},maxMessages:120,assistantStream:true},signal),f=>{state.accept(f);if(f.type==='snapshot')ready=true;});
  void pump(ctx.sessionController.control(signal),f=>state.control(f));
 },cancel(){close();}});
 return new Response(body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
