import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';
import {pageUrl,briefReceipt} from '../lib/receipt.js';
test('create receipt omits schema and values; pending read cannot masquerade as submitted',()=>{
 const x={id:'req-a',mode:'request',status:'pending',url:'/view',storage:'data/forms/request.yaml',form:{secret:'large'},values:{draft:1},activeValues:{draft:1}};
 assert.equal(briefReceipt(x,'create').form,undefined);assert.equal(briefReceipt(x,'create').config,undefined);assert.equal(briefReceipt(x,'read').ready,false);assert.equal(briefReceipt(x,'read').config,undefined);
 const done=briefReceipt({...x,status:'submitted',activeValues:{initial:null}},'read');assert.equal(done.ready,true);assert.deepEqual(done.config,{initial:null});
});
test('links use the clean local DSH base only; authentication tokens never enter receipts',()=>{
 const base=resolve('temp/forms-receipt-tests');mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,'case-'));mkdirSync(join(root,'.runtime'));
 writeFileSync(join(root,'.runtime/web-launch.json'),JSON.stringify({url:'http://127.0.0.1:3080',authenticatedUrl:'http://127.0.0.1:3080/?token=SYNTHETIC_PRIVATE_TOKEN'}));
 const url=pageUrl(root,{id:'req-a',mode:'request'});assert.equal(url,'http://127.0.0.1:3080/api/optdsh-forms/view?mode=request&id=req-a');assert.doesNotMatch(url,/token/);
});
