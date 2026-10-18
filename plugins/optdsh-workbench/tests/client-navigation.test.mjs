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


test('header entry uses the official themed button and external icon while retaining session new-tab navigation',()=>{
 let plugin,entry,opened;const Button=()=>{},IconRightUpOutlineRegular=()=>{};
 const sandbox={URLSearchParams,location:{hash:''},window:{open:(...args)=>opened=args,addEventListener(){},removeEventListener(){},__ModuleLoader__:{load:({factory})=>{plugin=factory(name=>name==='@deepseek-ai/dsh-client-ui-primitives'?{Button,IconRightUpOutlineRegular}:{createElement:(type,props,...children)=>({type,props,children})});}}}};
 vm.runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),sandbox);
 plugin.apply({effect:fn=>fn(),slots:{inject:(_slot,fn)=>fn(),register:(options,component)=>{entry={options,component};}}});
 const button=entry.component({sessionId:'session A'});
 assert.equal(button.type,Button);assert.equal(button.props.variant,'ghost');assert.equal(button.props.size,'sm');assert.equal(button.props.style,undefined);assert.equal(button.props.href,undefined);
 assert.equal(button.children[1].type,IconRightUpOutlineRegular);assert.equal(button.children[1].props['aria-hidden'],true);
 button.props.onClick();assert.deepEqual(opened,['/api/optdsh-workbench/view?session=session%20A','_blank','noopener,noreferrer']);
});
