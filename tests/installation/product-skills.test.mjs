import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {FileSystemSkillProvider} from '@deepseek-ai/dsh-skill-filesystem';
import {productSkillRoots} from '../../packages/optdsh-bundle/lib/product-skills.mjs';
const root=resolve('.');
test('official provider discovers product Skills outside source with an empty user root',async()=>{
 const dir=mkdtempSync(join(root,'temp/skill-discovery-'));mkdirSync(join(dir,'study'));mkdirSync(join(dir,'empty'));
 const roots=productSkillRoots(root);assert.equal(roots.length,2);
 const names=[];
 for(const item of roots){
  const control={signal:new AbortController().signal,invalidate(){}};
  const provider=new FileSystemSkillProvider({get(){},logger:{warn(){}}},control,{providerName:item.name,includeDefaultRoots:false,bundledSkillDir:item.path,watch:false,agentsHome:join(dir,'empty'),dshHome:join(dir,'empty')});
  try{
   const listed=await provider.list({cwd:join(dir,'study'),signal:control.signal});const list=Array.isArray(listed)?listed:listed.candidates;
   for(const candidate of list){const skill=await provider.get(candidate,{signal:control.signal});assert.ok(skill.content);assert.ok(skill.resourceBase.path.startsWith(item.path));names.push(skill.name);}
  }finally{await provider.dispose();}
 }
 assert.deepEqual(names.sort(),['optdsh-assembly-tolerance','optdsh-rx-collection-efficiency','ppt-slidewise']);
});
