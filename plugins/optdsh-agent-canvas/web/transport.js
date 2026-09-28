/** Shared transport for full DSH canvas and the optical quick-canvas modal. */
export const CANVAS_ORIGIN='http://127.0.0.1:4173';
export async function canvasApi(sessionId,action,payload={}){
 const response=await fetch('/api/optdsh-canvas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,sessionId,action})});
 const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'画板请求失败');return result;
}
export function canvasSource(channel,parentOrigin=location.origin){return CANVAS_ORIGIN+'/?embed=dsh&parentOrigin='+encodeURIComponent(parentOrigin)+'&channel='+encodeURIComponent(channel);}
export function attachCanvasBridge({frame,sessionId,channel,snapshot='',onState=()=>{},onError=()=>{},onReady=()=>{},api=canvasApi,target=window}){
 let live=true,pending=0;const timer=setTimeout(()=>{if(live)onError('画板尚未连接，请确认AgentCanvas服务已启动。');},12000);
 const listener=async event=>{
  const m=event.data;if(event.origin!==CANVAS_ORIGIN||event.source!==frame.contentWindow||m?.type!=='optdsh-canvas-request'||m.channel!==channel)return;
  pending++;
  try{
   if(!['load','save','submit','status','preview_edit','apply_edit','reject_edit'].includes(m.action))throw new Error('Unsupported embedded action');
   if(snapshot&&m.action!=='load')throw new Error('历史快照只读');
   const result=await api(sessionId,snapshot?'snapshot':m.action,snapshot?{submissionId:snapshot}:m.payload||{});
   if(!live)return;clearTimeout(timer);onState(result,m.action);onError('');onReady();event.source.postMessage({type:'optdsh-canvas-response',channel,id:m.id,result},CANVAS_ORIGIN);
  }catch(e){if(live){onError(e.message);event.source.postMessage({type:'optdsh-canvas-response',channel,id:m.id,error:e.message},CANVAS_ORIGIN);}}
  finally{pending--;}
 };
 target.addEventListener('message',listener);
 return {get pending(){return pending;},dispose(){live=false;clearTimeout(timer);target.removeEventListener('message',listener);}};
}
