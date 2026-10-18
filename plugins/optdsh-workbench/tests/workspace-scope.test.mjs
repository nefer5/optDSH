import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apply} from '../lib/index.js';

test('installed workbench accepts two official workspaces and rejects silent cwd drift',async()=>{
 const root=mkdtempSync(join(tmpdir(),'optdsh-workbench-roots-')),state=join(root,'state'),a=join(root,'a'),b=join(root,'b');for(const dir of [state,a,b])mkdirSync(dir);
 const routes=new Map(),sessions=new Map([['session-a',a],['session-b',b]]);let created;
 const ctx={on(){},effect:fn=>fn(),agents:{list:()=>[],get:()=>null},connection:{fetch:{register:r=>routes.set(r.path,r.fetch)}},sessionController:{
  inspect:async id=>({meta:{cwd:sessions.get(id)}}),create:async input=>{created=input;return input;},rename:async()=>{},
  list:async()=>({items:[...sessions].map(([sessionId,cwd])=>({sessionId,cwd}))})}};
 apply(ctx,{stateRoot:state,workspaceRoot:b});
 const call=async input=>{const response=await routes.get('/api/optdsh-workbench')(new Request('http://local/api',{method:'POST',body:JSON.stringify(input)}));return {status:response.status,body:await response.json()};};
 assert.equal((await call({action:'bind',sessionId:'session-a'})).status,200);
 assert.equal((await call({action:'bind',sessionId:'session-b'})).status,200);
 assert.equal((await call({action:'list'})).body.sessions.length,2);
 sessions.set('session-a',b);
 assert.equal((await call({action:'bind',sessionId:'session-a'})).body.error.code,'SESSION_WORKSPACE_CHANGED');
 assert.equal((await call({action:'create'})).status,200);assert.equal(created.cwd,b);
 const page=await routes.get('/api/optdsh-workbench/view')();assert.equal(page.status,200);assert.ok((await page.text()).includes('v'+JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version));
});
