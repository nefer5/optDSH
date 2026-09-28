import test from 'node:test';import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {SessionPresentation,sessionFeed} from '../lib/session-feed.js';
import {ChatState} from '../web/chat-state.js';
import {ReferenceEditor} from '../web/reference-editor.js';
import {renderMessage} from '../web/chat-message.js';
const opening=(records=[],assistantStream={revision:0})=>({type:'snapshot',records,hasMore:false,projections:{values:{}},assistantStream});
const event=(seq,type,data)=>({type:'event',event:{seq,type,data}});
const frame=f=>({type:'assistant-stream',frame:f});
test('same official frames project identical live text in two independent followers; final replaces preview',()=>{
 const a=new SessionPresentation('session-a'),b=new SessionPresentation('session-a');
 const feed=[opening(),event(1,'user/message',{source:{kind:'user',rpcId:'request'},content:[{type:'text',text:'question'}]}),frame({type:'start',revision:1,attemptId:'one',turn:1,step:1,startedAfterSeq:1}),frame({type:'chunk',revision:2,attemptId:'one',index:0,time:1,chunk:{type:'text-delta',index:0,text:'hello'}})];
 for(const f of feed){a.accept(f);b.accept(f);}
 assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(a.snapshot().messages.at(-1).text,'hello');
 const final=event(2,'assistant/message',{turn:1,step:1,message:{content:[{type:'text',text:'hello world'}]}});a.accept(final);b.accept(final);
 assert.equal(a.snapshot().messages.length,2);assert.equal(a.snapshot().messages.at(-1).streaming,undefined);assert.deepEqual(a.snapshot(),b.snapshot());
});
test('reconnect restores an in-flight canonical compact stream and rejects a missing chunk',()=>{
 const p=new SessionPresentation('session-a');p.accept(opening([],{revision:5,activeAttempt:{attemptId:'one',turn:1,step:1,nextIndex:1,startedAfterSeq:0,stream:[{type:'text-chunks',time0:1,index:0,dt:[],texts:['prefix']}]}}));
 assert.equal(p.snapshot().messages[0].text,'prefix');
 p.accept(frame({type:'chunk',revision:6,attemptId:'one',index:1,time:2,chunk:{type:'text-delta',index:0,text:' suffix'}}));assert.equal(p.snapshot().messages[0].text,'prefix suffix');
 assert.throws(()=>p.accept(frame({type:'chunk',revision:8,attemptId:'one',index:3,time:3,chunk:{type:'text-delta',index:0,text:'lost'}})),/gap/);
});
test('optimistic echo survives acknowledgement, retires on authoritative queue/history, and never enters another session',()=>{
 const c=new ChatState();c.select('A');c.echo('A','r','question');c.delivered('r');assert.equal(c.messages().length,1);
 c.select('B');assert.equal(c.messages().length,0);assert.equal(c.accept({sessionId:'A',messages:[{requestId:'r'}]}),false);
 c.select('A');c.accept({sessionId:'A',messages:[],queue:[{requestId:'r',seq:'q',text:'question'}]});assert.equal(c.messages().length,1);assert.equal(c.pending.size,0);
 c.accept({sessionId:'A',messages:[{requestId:'r',seq:1,text:'question'}],queue:[]});assert.equal(c.messages().length,1);
});
test('queue frame filters unrelated sessions and retires admitted message',()=>{
 const p=new SessionPresentation('A');p.accept(opening());const item={id:'q',rpcId:'r',placement:'queued',message:{content:[{type:'text',text:'next'}]}};
 p.control({type:'queue',sessionId:'B',items:[item]});assert.equal(p.snapshot().queue.length,0);
 p.control({type:'queue',sessionId:'A',items:[item]});assert.equal(p.snapshot().queue[0].text,'next');
 p.accept(event(1,'user/message',{source:{kind:'user',rpcId:'r'},content:[{type:'text',text:'next'}]}));assert.equal(p.snapshot().queue.length,0);
});
test('quoted text survives draft restore losslessly without becoming a model reference',()=>{
 const {document}=parseHTML('<html><body><div id="draft"></div></body></html>');globalThis.document=document;
 const editor=new ReferenceEditor(document.getElementById('draft'));const text='原文 <img>\n第二行 **保持原文**';
 editor.restore([{type:'text',text:'请解释：'},{type:'object',ref:{kind:'quote',text,label:'❝ 原文',sourceSessionId:'A',sourceSeq:'1'}}]);
 editor.markStale(null);assert.equal(editor.read(null).question,'请解释：'+text);assert.equal(editor.read(null).references.length,0);assert.equal(editor.el.querySelector('.stale'),null);
 const saved=editor.serialize();editor.restore(saved);assert.equal(editor.read(null).question,'请解释：'+text);assert.equal(editor.el.querySelector('img'),null);
});
test('optical context is not labelled as a canvas, reasoning remains collapsible',()=>{
 const {document}=parseHTML('<html><body></body></html>');const n=renderMessage({seq:1,role:'assistant',text:'answer',reasoning:'thinking',context:['<optdsh_optics_context>{}</optdsh_optics_context>']},document);
 assert.equal(n.querySelector('.message-context summary').textContent,'光学上下文');assert.equal(n.querySelector('.message-reasoning').hasAttribute('open'),false);
});
test('closing one SSE follower does not abort another',async()=>{
 const signals=[];const ctx={agents:{get:()=>({status:'running'})},sessionController:{async *follow(_r,s){signals.push(s);yield opening();await new Promise(r=>s.addEventListener('abort',r,{once:true}));},async *control(s){yield {type:'baseline',value:{queues:{},projections:{}}};await new Promise(r=>s.addEventListener('abort',r,{once:true}));}}};
 const requestA=new AbortController(),requestB=new AbortController(),shutdown=new AbortController();const a=sessionFeed(ctx,'A',requestA.signal,shutdown.signal),b=sessionFeed(ctx,'A',requestB.signal,shutdown.signal);
 const ar=a.body.getReader(),br=b.body.getReader();await Promise.all([ar.read(),br.read()]);await ar.cancel();assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);await br.cancel();
});
