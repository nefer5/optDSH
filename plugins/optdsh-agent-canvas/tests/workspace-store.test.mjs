import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkspaceBoardStore} from '../lib/workspace-store.js';
import {BoardStore} from '../lib/boards.js';

const scene={type:'excalidraw',elements:[{id:'a',type:'rectangle',x:0,y:0,width:20,height:20}]};
test('official session cwd owns durable boards across workspaces and restarts',()=>{
 const root=mkdtempSync(join(tmpdir(),'optdsh-canvas-workspaces-')),a=join(root,'a'),b=join(root,'b');mkdirSync(a);mkdirSync(b);
 const store=new WorkspaceBoardStore(),first=store.board('session-a',a),second=store.board('session-b',b);
 store.save(first,scene,0);assert.equal(second.revision,0);
 assert.ok(existsSync(join(a,'.agent-canvas/optdsh/boards',first.boardId+'.json')));
 const restored=new WorkspaceBoardStore().board('session-a',a);assert.equal(restored.revision,1);assert.deepEqual(restored.scene,scene);
 assert.throws(()=>store.board('session-c',undefined),/工作目录/);
});
test('legacy board keeps its original authority; duplicates fail without overwriting',()=>{
 const root=mkdtempSync(join(tmpdir(),'optdsh-canvas-legacy-')),workspace=join(root,'workspace'),legacyRoot=join(root,'legacy');mkdirSync(workspace);
 const old=new BoardStore(legacyRoot),board=old.board('session-old');old.save(board,scene,0);
 const store=new WorkspaceBoardStore({legacyRoot}),restored=store.board('session-old',workspace);assert.equal(restored.revision,1);
 assert.equal(existsSync(join(workspace,'.agent-canvas')),false);
 const target=join(workspace,'.agent-canvas/optdsh/boards');mkdirSync(target,{recursive:true});copyFileSync(join(legacyRoot,board.boardId+'.json'),join(target,board.boardId+'.json'));
 assert.throws(()=>new WorkspaceBoardStore({legacyRoot}).board('session-old',workspace),e=>e.code==='BOARD_MIGRATION_CONFLICT');
});
