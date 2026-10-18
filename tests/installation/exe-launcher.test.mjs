import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const repo=resolve(import.meta.dirname,'../..');
const base=join(repo,'temp/launch-tests');mkdirSync(base,{recursive:true});
const root=mkdtempSync(join(base,'exe-'));
const app=join(root,'中文 app with spaces');mkdirSync(join(app,'node_modules/optdsh-bundle/lib'),{recursive:true});
const exe=join(app,'optdsh.exe'),config=join(app,'optdsh-launcher.json'),receipt=join(app,'argv.json');
if(process.platform==='win32'){
 const build=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',join(repo,'scripts/maintenance/build-windows-launcher.ps1'),'-OutputPath',exe],{encoding:'utf8',timeout:30000});
 assert.equal(build.status,0,build.stderr+build.stdout);
 writeFileSync(join(app,'node_modules/optdsh-bundle/lib/launcher.mjs'),`import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(receipt)},JSON.stringify(process.argv.slice(2)));process.exit(process.argv.includes('--fail-fixture')?17:0);`);
}
function settings(nodeExecutable=process.execPath){writeFileSync(config,'\uFEFF'+JSON.stringify({schemaVersion:1,nodeExecutable}));}
function run(args){return spawnSync(exe,[...args,'--no-pause'],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,PATH:join(process.env.SystemRoot,'System32')}});}
test('EXE selects configured Node with no pwsh or node on PATH, handles BOM and forwards literal Unicode arguments',{skip:process.platform!=='win32'},()=>{
 settings();const values=['--workspace',"中文 space ' & $(literal) \",quoted\"",'trailing\\'];
 const result=run(values);assert.equal(result.status,0,result.stderr);
 const forwarded=JSON.parse(readFileSync(receipt,'utf8'));assert.deepEqual(forwarded,['--config',config,...values,'--no-pause']);
});
test('EXE propagates child failure code instead of reporting success',{skip:process.platform!=='win32'},()=>{
 settings();assert.equal(run(['--fail-fixture']).status,17);
});
test('EXE reports a missing explicitly configured Node without fallback or mutation',{skip:process.platform!=='win32'},()=>{
 settings(join(root,'missing/node.exe'));const result=run([]);assert.notEqual(result.status,0);assert.match(result.stderr,/Configured Node/);
});
