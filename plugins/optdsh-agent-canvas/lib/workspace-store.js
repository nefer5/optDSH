import {existsSync, realpathSync} from 'node:fs';
import {resolve, join, relative, isAbsolute, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {BoardStore, requireValue} from './boards.js';

// One authoritative store per board. Legacy boards remain in place until an
// explicit, audited migration; opening a workspace never copies user data.
export class WorkspaceBoardStore {
  constructor({legacyRoot}={}) { this.legacyRoot=legacyRoot;this.stores=new Map();this.owners=new Map(); }
  board(sessionId, cwd) {
    requireValue(typeof cwd==='string' && cwd.length>0,'会话缺少工作目录');
    const workspace=realpathSync(cwd),root=resolve(workspace,'.agent-canvas','optdsh','boards');
    let ancestor=root;while(!existsSync(ancestor))ancestor=dirname(ancestor);
    const rel=relative(workspace,realpathSync(ancestor));
    requireValue(rel!=='..'&&!rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&!isAbsolute(rel),'画板目录指向项目外部','BOARD_PATH_ESCAPE');
    const file='board-'+createHash('sha256').update(sessionId).digest('hex').slice(0,32)+'.json';
    const legacy=this.legacyRoot&&existsSync(join(this.legacyRoot,file));
    requireValue(!(legacy&&existsSync(join(root,file))),'发现旧、新两份画板，请先人工核对归属，未覆盖任何副本','BOARD_MIGRATION_CONFLICT');
    const target=legacy?resolve(this.legacyRoot):root;
    if(!this.stores.has(target))this.stores.set(target,new BoardStore(target));
    const store=this.stores.get(target),board=store.board(sessionId);
    this.owners.set(sessionId,store);return board;
  }
  observe(sessionId,event) { this.owners.get(sessionId)?.observe(sessionId,event); }
}
for(const method of ['persist','public','save','prepare','snapshot','proposeEdit','previewEdit','applyEdit','rejectEdit','complete']) {
  WorkspaceBoardStore.prototype[method]=function(board,...args) {
    const store=this.owners.get(board.sessionId);requireValue(store,'画板尚未关联工作目录');return store[method](board,...args);
  };
}
