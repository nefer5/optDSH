import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {launchPlan} from '../../packages/optdsh-bundle/lib/launcher.mjs';

const repo=resolve(import.meta.dirname,'../..');
mkdirSync(join(repo,'temp/launch-tests'),{recursive:true});
const root=mkdtempSync(join(repo,'temp/launch-tests/thin-'));
const config=join(root,'中文 config','optdsh-launcher.json');
mkdirSync(join(root,'app/scripts/runtime'),{recursive:true});
mkdirSync(join(root,'中文 config'),{recursive:true});
for(const name of ['open','status','stop'])writeFileSync(join(root,'app/scripts/runtime',name+'-dsh.ps1'),'fixture');
writeFileSync(config,'\uFEFF'+JSON.stringify({schemaVersion:1,installRoot:'../app',home:'../home',workspace:'../research'}));
test('thin entry uses built-in Windows shell and config-relative application without shell command interpolation',()=>{
 const plan=launchPlan(['--config',config,'--workspace',"research with spaces ' ; $(literal)",'--no-browser'],{cwd:root,env:{SystemRoot:'C:\\Windows',PATH:'no-pwsh'}});
 assert.equal(plan.installRoot,join(root,'app'));
 assert.match(plan.shell,/WindowsPowerShell[\\/]v1.0[\\/]powershell.exe$/);
 assert.equal(plan.args[plan.args.indexOf('-Workspace')+1],"research with spaces ' ; $(literal)");
 assert.ok(plan.args.includes('-NoBrowser'));assert.ok(plan.args.includes('-File'));assert.ok(!plan.args.includes('-Command'));
});
test('status and stop select the shared lifecycle scripts; legacy flags remain accepted',()=>{
 assert.match(launchPlan(['status','--config',config]).args.join(' '),/status-dsh.ps1/);
 assert.match(launchPlan(['stop','--config',config]).args.join(' '),/stop-dsh.ps1/);
 assert.ok(launchPlan(['-Config',config,'-NoBrowser']).args.includes('-NoBrowser'));
});
test('unknown options, missing values and broken or missing config fail before spawning',()=>{
 for(const args of [['--unknown'],['--config'],['--config',join(root,'missing.json')],['stop','--config',config,'--restart']])assert.throws(()=>launchPlan(args));
 const bad=join(root,'bad.json');writeFileSync(bad,JSON.stringify({schemaVersion:99}));
 assert.throws(()=>launchPlan(['--config',bad]),/Unsupported/);
});
