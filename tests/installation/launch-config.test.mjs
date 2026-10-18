import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';

const windows = process.platform === 'win32';
const repo = resolve(import.meta.dirname, '../..');
const work = join(repo, 'temp', 'launch-tests');
mkdirSync(work, {recursive:true});
const root = mkdtempSync(join(work, 'paths-'));
const quote = value => `'${value.replaceAll("'", "''")}'`;
function pwsh(source, options={}) {
  const env = {...process.env};
  for(const key of Object.keys(env)) if(key.startsWith('OPTDSH_')) delete env[key];
  return spawnSync('pwsh', ['-NoProfile','-NonInteractive','-Command', `$ErrorActionPreference='Stop'; . ${quote(join(repo,'scripts/runtime/launch-config.ps1'))}; ${source}`], {encoding:'utf8', env:{...env,...options.env}, cwd:root});
}
function context(source='', options={}) {
  const result=pwsh(`Resolve-OptDshLaunch ${source} | ConvertTo-Json -Depth 5`,options);
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}
const check=(name,fn)=>test(name,{skip:!windows},fn);

check('launch defaults separate install, user home, profile, workspace and state without writing home',()=>{
  const value=context();
  assert.equal(value.InstallRoot,repo);
  assert.match(value.Home, /[\\/]\.optdsh$/);
  assert.equal(value.Workspace,root);
  assert.equal(value.ProfileRoot,join(value.Home,'profiles','web'));
  assert.equal(value.StateRoot,join(value.Home,'state','web'));
  assert.deepEqual(value.Components,['core']);
});
check('explicit home and state resolve relative to invoking workspace; no migration or creation',()=>{
  const value=context('-Home ./independent-home -StateRoot ./state -Profile research');
  assert.equal(value.Home,join(root,'independent-home'));
  assert.equal(value.StateRoot,join(root,'state'));
  assert.equal(existsSync(value.Home),false);
  assert.equal(existsSync(value.StateRoot),false);
});
check('config relative paths use config directory, with command > environment > config precedence',()=>{
  const dir=join(root,'config dir 中文');mkdirSync(dir);
  const config=join(dir,'runtime.json');
  writeFileSync(config,JSON.stringify({home:'./configured-home',workspace:'..',stateRoot:'./state',profile:'configured',components:['workbench'],port:49001}));
  const configured=context(`-Config ${quote(config)}`);
  assert.equal(configured.Home,join(dir,'configured-home'));
  assert.equal(configured.Workspace,root);
  assert.equal(configured.Profile,'configured');
  assert.equal(configured.Port,49001);
  const env={OPTDSH_HOME:join(root,'env-home'),OPTDSH_PROFILE:'env',OPTDSH_PORT:'49002'};
  const environment=context(`-Config ${quote(config)}`,{env});
  assert.equal(environment.Home,env.OPTDSH_HOME);assert.equal(environment.Profile,'env');assert.equal(environment.Port,49002);
  const explicit=context(`-Config ${quote(config)} -Home ./arg-home -Profile explicit -Port 49003 -Components core,forms`,{env});
  assert.equal(explicit.Home,join(root,'arg-home'));assert.equal(explicit.Profile,'explicit');assert.equal(explicit.Port,49003);assert.deepEqual(explicit.Components,['core','forms']);
});
check('profiles have distinct state directories while sharing the same home',()=>{
  const a=context('-Home ./shared -Profile a'),b=context('-Home ./shared -Profile b');
  assert.equal(a.Home,b.Home);assert.notEqual(a.StateRoot,b.StateRoot);
});
check('blank workspace settings do not require study.yaml and ordinary cwd is valid',()=>assert.equal(context().Workspace,root));
check('profile traversal and desktop profile are rejected',()=>{
  for(const profile of ['../escape','a/b','desktop','a b']) assert.notEqual(pwsh(`Resolve-OptDshLaunch -Profile ${quote(profile)}`).status,0);
});
check('missing workspace or explicit config and malformed configuration fail visibly',()=>{
  assert.notEqual(pwsh('Resolve-OptDshLaunch -Workspace ./missing').status,0);
  assert.notEqual(pwsh('Resolve-OptDshLaunch -Config ./missing.json').status,0);
  const invalid=join(root,'invalid.json');writeFileSync(invalid,'{');
  assert.notEqual(pwsh(`Resolve-OptDshLaunch -Config ${quote(invalid)}`).status,0);
});
check('invalid ports, component injection and install/home conflation are rejected',()=>{
  for(const args of ['-Port 80','-Port 65536','-Components "core,--patch"',`-Home ${quote(repo)}`]) assert.notEqual(pwsh(`Resolve-OptDshLaunch ${args}`).status,0);
});
check('owner identity rejects reused PID, wrong roots and command substring impostors',()=>{
  const script=`
  $c=Resolve-OptDshLaunch -Home ./fixture-home -Port 49004;
  $s=[pscustomobject]@{schemaVersion=1;pid=123;startedUtc='2026-01-01T00:00:00Z';entry=$c.Entry;home=$c.Home;profile=$c.Profile;workspace=$c.Workspace;stateRoot=$c.StateRoot;port=$c.Port};
  function Get-Process { [pscustomobject]@{StartTime=[datetime]'2026-01-01T00:00:00Z'} }
  $script:command='node.exe "'+$c.Entry+'" --profile web --patch "'+$c.PatchPath+'" --port 49004';
  function Get-CimInstance { [pscustomobject]@{CommandLine=$script:command} }
  $results=@(Test-OptDshOwner $c $s);
  $s.startedUtc='2025-01-01T00:00:00Z';$results+=Test-OptDshOwner $c $s;$s.startedUtc='2026-01-01T00:00:00Z';
  $s.home+='-wrong';$results+=Test-OptDshOwner $c $s;$s.home=$c.Home;
  $script:command=$script:command.Replace($c.Entry,$c.Entry+'.impostor');$results+=Test-OptDshOwner $c $s;
  $results | ConvertTo-Json`;
  const result=pwsh(script);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),[true,false,false,false]);
});
