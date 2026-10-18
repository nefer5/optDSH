import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apply} from '../lib/index.js';

test('canvas API derives two project stores from official cwd and refuses drift',async()=>{
 const root=mkdtempSync(join(tmpdir(),'optdsh-canvas-api-')),a=join(root,'a'),b=join(root,'b');mkdirSync(a);mkdirSync(b);
 const sessions=new Map([['session-a',a],['session-b',b]]),routes=new Map();
 const ctx={on(){},effect:fn=>fn(),tools:{register(){}},systemPrompt:{section(){}},agents:{get(){}},connection:{fetch:{register:r=>routes.set(r.path,r.fetch)}},sessionController:{inspect:async id=>({meta:{cwd:sessions.get(id)},events:[]})}};
 apply(ctx,{stateRoot:root,editorUrl:'http://127.0.0.1:5199'});
 const call=async sessionId=>{const r=await routes.get('/api/optdsh-canvas')(new Request('http://local/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,action:'load'})}));return {status:r.status,body:await r.json()};};
 const first=await call('session-a'),second=await call('session-b');assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(first.body.host.workspaceRoot,a);assert.equal(second.body.host.workspaceRoot,b);assert.equal(first.body.host.name,'DSH');
 assert.ok(existsSync(join(a,'.agent-canvas/optdsh/boards',first.body.boardId+'.json')));
 assert.ok(existsSync(join(b,'.agent-canvas/optdsh/boards',second.body.boardId+'.json')));
 sessions.set('session-a',b);assert.equal((await call('session-a')).body.error.code,'SESSION_WORKSPACE_CHANGED');
 const transport=await routes.get('/api/optdsh-canvas/transport')();assert.match(await transport.text(),/127\.0\.0\.1:5199/);
});
