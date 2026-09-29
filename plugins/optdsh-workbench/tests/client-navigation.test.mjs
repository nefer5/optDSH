import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('deep link waits for catalog publication after an early refresh and opens once',async()=>{
 let plugin,listener,opened=[],errors=[],ids=[],removed=false;
 const sandbox={URLSearchParams,setTimeout,clearTimeout,console:{error:(...x)=>errors.push(x)},
  location:{hash:'#optdsh-session=synthetic',pathname:'/',search:''},history:{replaceState(){}},
  window:{__ModuleLoader__:{load:({factory})=>{plugin=factory(()=>({createElement(){}}));}},addEventListener(){},removeEventListener(){}}};
 vm.runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),sandbox);
 plugin.apply({sessions:{refresh:async()=>{},list:{getSnapshot:()=>({ids}),subscribe(fn){listener=fn;return()=>{removed=true;};}}},uiWorkspace:{openSession:id=>opened.push(id)},effect:fn=>fn(),slots:{inject(){}}});
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(opened,[]);assert.equal(typeof listener,'function');
 ids=['synthetic'];listener();await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(opened,['synthetic']);assert.equal(removed,true);assert.deepEqual(errors,[]);
});
