import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const repo=resolve(import.meta.dirname,'../..'),base=join(repo,'temp/workbench-profile-20261018/entry-tests');mkdirSync(base,{recursive:true});
for(const status of ['disabled','unselected','not-installed'])test('workbench opener preserves '+status+' and never starts optics',{skip:process.platform!=='win32'},()=>{
 const root=mkdtempSync(join(base,'case-')),app=join(root,'app'),runtime=join(app,'scripts/runtime'),home=join(root,'用户 Home'),workspace=join(root,'课题');for(const p of [runtime,home,workspace,join(app,'packages/optdsh-bundle/lib'),join(app,'.runtime')])mkdirSync(p,{recursive:true});
 for(const file of ['open-optics.ps1','launch-config.ps1'])copyFileSync(join(repo,'scripts/runtime',file),join(runtime,file));
 writeFileSync(join(runtime,'open-dsh.ps1'),`param([Alias('Home')][string]$DshHome,[string]$Profile,[string]$Workspace,[string]$StateRoot,[int]$Port,[string[]]$Components,[switch]$NoBrowser)\n@{home=$DshHome;components=$Components}|ConvertTo-Json|Set-Content -LiteralPath '${join(app,'opened.json').replaceAll("'","''")}' -Encoding utf8`);
 writeFileSync(join(runtime,'start-optics.ps1'),`'forbidden'|Set-Content -LiteralPath '${join(app,'optics-started').replaceAll("'","''")}'`);
 writeFileSync(join(app,'packages/optdsh-bundle/lib/cli.mjs'),`console.log(JSON.stringify({enabled:false,status:'${status}'}));`);
 writeFileSync(join(app,'.runtime/development.json'),JSON.stringify({launchConfig:'preview.json'}));writeFileSync(join(app,'.runtime/preview.json'),JSON.stringify({home,workspace,components:['core'],port:3385}));
 const r=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(runtime,'open-optics.ps1'),'-NoBrowser'],{encoding:'utf8',timeout:15000,env:{...process.env,OPTDSH_HOME:'',OPTDSH_COMPONENTS:''}});
 assert.notEqual(r.status,0);assert.match(r.stderr+r.stdout,/Base DSH is running/);assert(!existsSync(join(app,'optics-started')));const opened=JSON.parse(readFileSync(join(app,'opened.json'),'utf8').replace(/^\uFEFF/,''));assert.equal(opened.home,home);assert.deepEqual([opened.components].flat(),['core']);
});
