import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canvasProfileState} from '../../packages/optdsh-bundle/lib/profile-components.mjs';
import {compose} from '../../packages/optdsh-bundle/lib/compose.mjs';
import {canvasRuntimeOptions} from '../../plugins/optdsh-agent-canvas/lib/config.js';
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'optdsh-profile-')),installRoot=join(root,'app'),home=join(root,'home'),dir=join(home,'profiles/web'),pkg=join(dir,'node_modules/optdsh-agent-canvas');
 mkdirSync(pkg,{recursive:true});mkdirSync(join(installRoot,'node_modules/@deepseek-ai/dsh'),{recursive:true});
 writeFileSync(join(installRoot,'package.json'),'{}');writeFileSync(join(installRoot,'node_modules/@deepseek-ai/dsh/package.json'),'{"name":"@deepseek-ai/dsh","version":"0.2.1-rc.2"}');
 const meta={dependencies:{'optdsh-agent-canvas':'0.6.0'},dsh:{profile:{bundles:['optdsh-agent-canvas']}}};
 writeFileSync(join(dir,'package.json'),JSON.stringify(meta));writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'optdsh-agent-canvas',version:'0.6.0',type:'module',main:'index.js',dsh:{bundle:{patch:'cordis.patch.yml'}}}));
 writeFileSync(join(pkg,'index.js'),'export function apply(){}');writeFileSync(join(pkg,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'optdsh-agent-canvas',name:'optdsh-agent-canvas'}]}]));
 return {root,installRoot,home,dir,meta,workspace:root};
}
function patch(f,value){writeFileSync(join(f.dir,'cordis.patch.yml'),value);}
function manifest(f){writeFileSync(join(f.dir,'package.json'),JSON.stringify(f.meta));}
test('Profile-owned Canvas loads independently of component recommendation without product insertion',()=>{const f=fixture(),s=canvasProfileState(f);assert.equal(s.enabled,true);const {patchPath}=compose({...f,components:'core'}),p=JSON.parse(readFileSync(patchPath));assert.equal(p[0].insert.length,1);assert.equal(p[0].insert[0].config.optional[0].profileOwned,true);assert(!p.some(r=>r.id==='optdsh-agent-canvas'));});
test('official bundle deselection is retained even when components still recommends Canvas',()=>{const f=fixture();f.meta.dsh.profile.bundles=[];manifest(f);assert.equal(canvasProfileState(f).status,'unselected');const p=JSON.parse(readFileSync(compose({...f,components:'canvas'}).patchPath));assert.equal(p[0].insert.length,1);assert(!p.some(r=>r.id==='optdsh-agent-canvas'));});
test('official Profile and Home disabled patches are respected without force-enable',()=>{const f=fixture();patch(f,'- id: optdsh-agent-canvas\n  disabled: true\n');assert.equal(canvasProfileState(f).status,'disabled');patch(f,'- id: optdsh-agent-canvas\n  disabled: false\n');writeFileSync(join(f.home,'cordis.patch.yml'),'- id: optdsh-agent-canvas\n  disabled: true\n');assert.equal(canvasProfileState(f).enabled,false);const p=JSON.parse(readFileSync(compose({...f,components:'canvas',canvasUnavailable:'should not override off'}).patchPath));assert(!p.some(r=>r.id==='optdsh-agent-canvas'));});
test('uninstalled Canvas never falls back to a same-named application/source package',()=>{const f=fixture();f.meta.dependencies={};f.meta.dsh.profile.bundles=[];manifest(f);const appPkg=join(f.installRoot,'node_modules/optdsh-agent-canvas');mkdirSync(appPkg);writeFileSync(join(appPkg,'package.json'),'{"name":"optdsh-agent-canvas","version":"9.0.0"}');assert.equal(canvasProfileState(f).status,'not-installed');const p=JSON.parse(readFileSync(compose({...f,components:'canvas'}).patchPath));assert.equal(p[0].insert.length,1);assert(!JSON.stringify(p).includes('9.0.0'));});
test('an application shadow copy is reported and isolated rather than masking a Profile upgrade',()=>{const f=fixture(),appPkg=join(f.installRoot,'node_modules/optdsh-agent-canvas');mkdirSync(appPkg);writeFileSync(join(appPkg,'package.json'),JSON.stringify({name:'optdsh-agent-canvas',version:'9.0.0',dsh:{bundle:{patch:'cordis.patch.yml'}}}));writeFileSync(join(appPkg,'cordis.patch.yml'),'[]');const state=canvasProfileState(f);assert.equal(state.status,'unavailable');assert.equal(state.isolate,true);});
test('bridge uses Home defaults while explicit official Profile config wins',()=>{const f=fixture();mkdirSync(join(f.home,'config'));writeFileSync(join(f.home,'config/canvas.json'),'{"editorUrl":"http://127.0.0.1:4174"}');const env={DSH_HOME:f.home,OPTDSH_STATE_ROOT:join(f.home,'state/custom')};assert.equal(canvasRuntimeOptions({},env).editorUrl,'http://127.0.0.1:4174');assert.equal(canvasRuntimeOptions({editorUrl:'http://127.0.0.1:4180'},env).editorUrl,'http://127.0.0.1:4180');assert.equal(canvasRuntimeOptions({},env).stateRoot,env.OPTDSH_STATE_ROOT);});

test('explicit Profile editor config still works when the unused Home default is broken',()=>{const f=fixture();mkdirSync(join(f.home,'config'));writeFileSync(join(f.home,'config/canvas.json'),'broken');assert.equal(canvasRuntimeOptions({editorUrl:'http://127.0.0.1:4180'},{DSH_HOME:f.home}).editorUrl,'http://127.0.0.1:4180');});
