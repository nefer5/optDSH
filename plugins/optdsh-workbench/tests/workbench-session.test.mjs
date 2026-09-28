import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore,selectionRequest,promptContent,surfaceMessages,modelContext} from '../lib/core.js';
const fixture=()=>new WorkbenchStore(join(mkdtempSync(join(tmpdir(),'optdsh-wb-')),'bindings.json'));
test('model switch drops implicit old selection, carries transition and rejects stale tab',()=>{
 const row={lastSelection:{modelId:'a',revision:'ra',objectIds:'["a/1"]'},lastModel:{modelId:'a',bindingId:'old'}};
 const view={snapshot:{modelId:'b',revision:'rb',sourceFile:'b.zmx'},binding:{id:'new'},error:null};
 const r=modelContext(row,view,{question:'continue',modelId:'b',revision:'rb',bindingId:'new'});
 assert.equal(r.selected,null);assert.equal(r.context.modelChanged,true);assert.equal(r.context.activeModel.sourceFile,'b.zmx');
 assert.throws(()=>modelContext(row,view,{modelId:'a',revision:'ra'}),e=>e.code==='STALE_REVISION');
 assert.throws(()=>modelContext(row,view,{bindingId:'old'}),e=>e.code==='STALE_BINDING');
 assert.equal(modelContext(row,{...view,error:{code:'HOST_UNAVAILABLE'}},{}).context.activeModel.fresh,false);
 const ref={modelId:'b',revision:'rb',objectId:'b/1'};
 assert.equal(modelContext(row,view,{modelId:'b',revision:'rb',references:[ref]}).selected.objectId,'b/1');
});
test('receipts isolate sessions, reject changed duplicates, survive restart',()=>{const st=fixture();st.bind('session-a');st.bind('session-b');const input={requestId:'optics-request-123',question:'A'};const first=st.prepare('session-a',input);assert.equal(first.fresh,true);assert.equal(st.prepare('session-a',input).fresh,false);assert.equal(st.prepare('session-b',input).fresh,true);assert.throws(()=>st.prepare('session-a',{...input,question:'B'}),e=>e.code==='REQUEST_CONFLICT');first.record.status='accepting';st.persist();assert.equal(new WorkbenchStore(st.file).get('session-a').requests[input.requestId].status,'uncertain');});
test('selection identities must match the explicit model revision',()=>{const ref={modelId:'m',revision:'r',objectId:'m/r/one'};const selected=selectionRequest({modelId:'m',revision:'r',references:[ref,ref]});assert.deepEqual(JSON.parse(selected.objectIds),[ref.objectId]);assert.throws(()=>selectionRequest({modelId:'m',revision:'r2',references:[ref]}),e=>e.code==='STALE_REVISION');assert.throws(()=>selectionRequest({modelId:'m',revision:'r',references:[]}));});
test('light transcript keeps official message sequence and folds optical context',()=>{const content=promptContent('question',{modelId:'m',revision:'r'},'optics-12345678');const result=surfaceMessages([{event:{seq:2,type:'user/message',data:{content,source:{kind:'user',rpcId:'optics-12345678'}}}},{event:{seq:8,type:'assistant/message',data:{message:{content:[{type:'text',text:'answer'}]}}}}]);assert.equal(result[0].text,'question');assert.equal(result[0].context.length,1);assert.equal(result[1].seq,8);assert.equal(result[1].text,'answer');});

test('light view excludes injected instruction messages',()=>{const out=surfaceMessages([{event:{seq:1,type:'user/message',data:{source:{kind:'plugin'},content:[{type:'text',text:'secret instructions'}]}}},{event:{seq:2,type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'human'}]}}}]);assert.equal(out.length,1);assert.equal(out[0].text,'human');});
