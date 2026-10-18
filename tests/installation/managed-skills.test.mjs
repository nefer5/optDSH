import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {FileSystemSkillProvider} from '@deepseek-ai/dsh-skill-filesystem';
import {syncSkillDirectory,syncManagedSkills} from '../../packages/optdsh-bundle/lib/managed-skills.mjs';
import {validationRun} from './validation-run.mjs';
const batch=validationRun('managed-skills');after(batch.retire);
function skill(path,name,text){mkdirSync(path,{recursive:true});writeFileSync(join(path,'SKILL.md'),`---\nname: ${name}\ndescription: fixture\n---\n${text}\n`);}
test('official default Home discovery works outside source, and disabled owned links leave no catalog entry',async()=>{
 const home=join(batch.root,'home'),root=join(home,'skills'),source=join(batch.root,'resources/sample'),workspace=join(batch.root,'external-workspace'),empty=join(batch.root,'empty');
 mkdirSync(workspace);mkdirSync(empty);skill(source,'sample-skill','resource-body');
 const manifest=join(home,'config/managed.json');
 syncSkillDirectory(root,[{name:'sample-skill',target:source,owner:'fixture'}],manifest);
 assert.equal(realpathSync(join(root,'sample-skill')),realpathSync(source));
 const control={signal:new AbortController().signal,invalidate(){}};
 const provider=new FileSystemSkillProvider({get(){},logger:{warn(){}}},control,{watch:false,dshHome:home,agentsHome:empty});
 try{
  const list=await provider.list({cwd:workspace,signal:control.signal});const candidate=list.find(x=>x.name==='sample-skill');assert.ok(candidate);assert.equal(candidate.source,'user-dsh');
  const body=await provider.get(candidate,{signal:control.signal});assert.match(body.content,/resource-body/);
  syncSkillDirectory(root,[],manifest);
  assert.equal(existsSync(join(root,'sample-skill')),false);assert.equal(readFileSync(join(source,'SKILL.md'),'utf8').includes('resource-body'),true);
  assert.equal((await provider.list({cwd:workspace,signal:control.signal})).some(x=>x.name==='sample-skill'),false);
 }finally{await provider.dispose();}
});
test('user skills and changed managed entries are preserved while product links upgrade',()=>{
 const home=join(batch.root,'conflicts'),root=join(home,'skills'),manifest=join(home,'config/managed.json');
 const first=join(batch.root,'first'),next=join(batch.root,'next');skill(first,'owned-skill','first');skill(next,'owned-skill','next');skill(join(root,'user-skill'),'user-skill','user');
 let result=syncSkillDirectory(root,[{name:'owned-skill',target:first,owner:'fixture'},{name:'user-skill',target:first,owner:'fixture'}],manifest);
 assert.ok(result.conflicts.some(x=>x.name==='user-skill'));
 result=syncSkillDirectory(root,[{name:'owned-skill',target:next,owner:'fixture'}],manifest);assert.equal(realpathSync(join(root,'owned-skill')),realpathSync(next));
 assert.match(readFileSync(join(root,'user-skill/SKILL.md'),'utf8'),/user/);
 syncSkillDirectory(root,[],manifest);assert.ok(existsSync(join(root,'user-skill/SKILL.md')));
});
test('official Profile enable, disable and removal control the Home skill projection',()=>{
 const root=join(batch.root,'profile-lifecycle'),installRoot=join(root,'app'),home=join(root,'home'),profile=join(home,'profiles/web'),pkg=join(profile,'node_modules/optdsh-forms');
 mkdirSync(join(installRoot,'node_modules/@deepseek-ai/dsh'),{recursive:true});writeFileSync(join(installRoot,'package.json'),'{}');writeFileSync(join(installRoot,'node_modules/@deepseek-ai/dsh/package.json'),'{"version":"0.2.1-rc.2"}');
 mkdirSync(pkg,{recursive:true});writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'optdsh-forms',version:'0.9.0',dsh:{bundle:{patch:'cordis.patch.yml'}}}));writeFileSync(join(pkg,'cordis.patch.yml'),'- insert:\n    - id: optdsh-forms\n      name: optdsh-forms\n');
 skill(join(pkg,'skills/dsh-forms'),'dsh-forms','forms-body');
 const meta={dependencies:{'optdsh-forms':'0.9.0'},dsh:{profile:{bundles:['optdsh-forms']}}};writeFileSync(join(profile,'package.json'),JSON.stringify(meta));
 syncManagedSkills({installRoot,home});assert.ok(existsSync(join(home,'skills/dsh-forms/SKILL.md')));
 writeFileSync(join(profile,'cordis.patch.yml'),'- id: optdsh-forms\n  disabled: true\n');syncManagedSkills({installRoot,home});assert.equal(existsSync(join(home,'skills/dsh-forms')),false);
 writeFileSync(join(profile,'cordis.patch.yml'),'- id: optdsh-forms\n  disabled: false\n');syncManagedSkills({installRoot,home});assert.ok(existsSync(join(home,'skills/dsh-forms/SKILL.md')));
 meta.dependencies={};meta.dsh.profile.bundles=[];writeFileSync(join(profile,'package.json'),JSON.stringify(meta));syncManagedSkills({installRoot,home});assert.equal(existsSync(join(home,'skills/dsh-forms')),false);assert.ok(existsSync(join(pkg,'skills/dsh-forms/SKILL.md')));
});
