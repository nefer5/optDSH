import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync} from 'node:fs';
import YAML from 'yaml';
import {loadExperts,readResource} from '../lib/core.js';
import {apply} from '../lib/index.js';
const root=resolve(import.meta.dirname,'../resources');
test('public snapshot includes both experts without private preferences',()=>{
 const experts=loadExperts(root);assert.equal(experts.length,2);
 for(const e of experts){const snapshot=JSON.parse(readFileSync(join(root,e.name,'snapshot.json')));assert.equal(snapshot.privateIncluded,false);assert.ok(snapshot.files['library/START.md']);assert.ok(readResource(root,e.name,'START.md').bytes.length);assert.match(readResource(root,e.name,'preferences.md').bytes.toString(),/未提供私人/);}
});
test('resources reject unknown experts, traversal and unlisted files',()=>{
 for(const [expert,file]of [['missing','library/START.md'],['visual-designer','../../package.json'],['visual-designer','private/secret.md'],['visual-designer','library/../instructions.md']])assert.throws(()=>readResource(root,expert,file));
});
test('official bundle owns presets and tools under a single removable Profile group',()=>{
 const doc=YAML.parse(readFileSync(resolve(import.meta.dirname,'../cordis.patch.yml'),'utf8'),{customTags:[{tag:'tag:yaml.org,2002:js',resolve:value=>value}]});
 const group=doc[0].insert[0];assert.equal(group.id,'optdsh-experts');assert.equal(group.name,'cordis:group');
 const presets=group.config.filter(r=>r.name==='@deepseek-ai/dsh-agent-preset');assert.equal(presets.length,2);
 for(const preset of presets){assert.match(preset.config.id,/^optdsh-/);const persona=preset.config.plugins.find(r=>r.id==='persona');assert.ok(persona.config.prefix.length>100);}
 const tools=group.config.filter(r=>r.name==='@deepseek-ai/dsh-tool-subagent');assert.equal(tools.length,2);
 for(const tool of tools){assert.equal(tool.config.provider,'spawn');assert.ok(presets.some(p=>p.config.id===tool.config.agentPreset));assert.equal(tool.config.persona,undefined);}
});
test('resource adapter authorizes real current Agents in an external workspace',async()=>{
 let tool;const agent={id:'external',session:{header:{cwd:'Z:/external-study'}}};
 apply({tools:{register:t=>tool=t},agents:{get:id=>id===agent.id?agent:undefined}},{resourceRoot:root});
 const args={expert:'software-architect',resource:'library/START.md'},signal=new AbortController().signal;
 assert.ok((await tool.execute(args,{agent,signal})).text);
 await assert.rejects(tool.execute(args,{agent:{...agent},signal}),/current official Agent/);
});
