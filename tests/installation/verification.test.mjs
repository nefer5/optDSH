import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,copyFileSync,openSync,closeSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validationRun} from './validation-run.mjs';

const repo=resolve(import.meta.dirname,'../..');
const script=join(repo,'packaging/windows/verify-installation.ps1');
const temp=join(repo,'temp','installation-verification-tests');mkdirSync(temp,{recursive:true});
const fixtures=mkdtempSync(join(temp,'fixture-'));
// Explicitly designated by the user; each test gets a new case, never reused.
const batch=validationRun('installation-verification');after(batch.retire);
const validationBase=batch.root;
const nextCase=()=>join(validationBase,'unit-'+randomUUID());
const quote=value=>`'${value.replaceAll("'","''")}'`;
const manifest={schemaVersion:1,dshVersion:'0.2.1-rc.2',components:['core','workbench','canvas','forms'].map(id=>({id}))};
function release(name='release-'+randomUUID()){
 const root=join(fixtures,name);mkdirSync(join(root,'packaging/windows'),{recursive:true});
 writeFileSync(join(root,'release-manifest.json'),JSON.stringify(manifest));
 writeFileSync(join(root,'packaging/windows/install.ps1'),'throw "fixture installer must not run during dry-run"');
 return root;
}
function verify(releaseRoot,validationRoot,extra='',mockNode=false,nodeVersion='24.99.0'){
 const stamp=randomUUID(),out=join(fixtures,stamp+'.stdout.log'),err=join(fixtures,stamp+'.stderr.log');
 const stdout=openSync(out,'w'),stderr=openSync(err,'w');let result;
 const prefix=mockNode?`function node.exe { $global:LASTEXITCODE=0; ${quote(nodeVersion)} }; `:'';
 try{result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; ${prefix}& ${quote(script)} -ReleaseRoot ${quote(releaseRoot)} -ValidationRoot ${quote(validationRoot)} ${extra}`],{cwd:repo,stdio:['ignore',stdout,stderr],timeout:180000});}finally{closeSync(stdout);closeSync(stderr);}
 return {...result,stdout:readFileSync(out,'utf8'),stderr:readFileSync(err,'utf8')};
}
const check=(name,fn)=>test(name,{skip:process.platform!=='win32',timeout:180000},fn);

check('dry-run describes distinct app/home/workspace/state and writes no validation case',()=>{
 const target=nextCase(),result=verify(release(),target,'-DryRun');assert.equal(result.status,0,result.stderr);
 const plan=JSON.parse(result.stdout);assert.equal(new Set([plan.installRoot,plan.home,plan.workspace,plan.stateRoot]).size,4);assert.deepEqual(plan.components,['core']);assert.equal(plan.modelRequests,false);assert.equal(existsSync(target),false);
});
check('explicit validation cache reuse is labelled and never points into source or release',()=>{
 const source=release(),target=nextCase(),cache=join(validationBase,'shared-cache-'+randomUUID());
 const result=verify(source,target,`-NpmCacheRoot ${quote(cache)} -DryRun`);
 assert.equal(result.status,0,result.stderr);const plan=JSON.parse(result.stdout);
 assert.equal(plan.npmCacheRoot,cache);assert.equal(plan.cacheMode,'explicit-cache-reuse-not-a-cold-network-test');assert.equal(existsSync(target),false);
 for(const invalid of [join(repo,'node_modules'),join(source,'npm-cache')])assert.notEqual(verify(source,nextCase(),`-NpmCacheRoot ${quote(invalid)} -DryRun`).status,0);
});
check('component selection normalizes core and comma lists; unknown and duplicate manifest IDs fail',()=>{
 const valid=release(),result=verify(valid,nextCase(),'-Components canvas,workbench,forms,canvas -DryRun');assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout).components,['core','canvas','workbench','forms']);
 assert.notEqual(verify(valid,nextCase(),'-Components missing -DryRun').status,0);
 const duplicate=release();writeFileSync(join(duplicate,'release-manifest.json'),JSON.stringify({...manifest,components:[...manifest.components,{id:'core'}]}));assert.notEqual(verify(duplicate,nextCase(),'-DryRun').status,0);
});
check('validation cannot overlap source, release or its ancestors and cannot reuse an existing case',()=>{
 const source=release();
 for(const target of [join(repo,'temp','forbidden-'+randomUUID()),source,join(source,'case'),fixtures])assert.notEqual(verify(source,target,'-DryRun').status,0);
 const used=nextCase();mkdirSync(used,{recursive:true});writeFileSync(join(used,'sentinel.txt'),'preserved');
 assert.notEqual(verify(source,used,'-DryRun').status,0);assert.equal(readFileSync(join(used,'sentinel.txt'),'utf8'),'preserved');
});
check('release reparse aliases are rejected before execution',()=>{
 const source=release(),alias=join(fixtures,'junction-'+randomUUID());symlinkSync(source,alias,'junction');const result=verify(alias,nextCase(),'-DryRun');assert.notEqual(result.status,0);assert.match(result.stderr,/reparse/);
});
check('missing installer, unsupported manifest and low port fail without creating cases',()=>{
 const bad=join(fixtures,'missing');mkdirSync(bad);assert.notEqual(verify(bad,nextCase(),'-DryRun').status,0);
 const version=release();writeFileSync(join(version,'release-manifest.json'),JSON.stringify({...manifest,schemaVersion:2}));assert.notEqual(verify(version,nextCase(),'-DryRun').status,0);
 assert.notEqual(verify(release(),nextCase(),'-Port 80 -DryRun').status,0);
});
check('failed fake installer retains a sanitized receipt and private output without token leakage',()=>{
 const source=release(),target=nextCase();writeFileSync(join(source,'packaging/windows/install.ps1'),`param($ReleaseRoot,$InstallRoot,[Alias('Home')]$CaseHome,$Workspace,$Components)\nWrite-Output 'synthetic-private-token-do-not-print'; exit 9`);
 const result=verify(source,target,'',true);assert.notEqual(result.status,0);
 const receipt=JSON.parse(readFileSync(join(target,'verification-receipt.json'),'utf8'));assert.equal(receipt.status,'failed');assert.equal(receipt.failure.phase,'install');assert.equal(receipt.cleanup,'no-host-receipt');assert(!JSON.stringify(receipt).includes('synthetic-private-token'));assert(!(result.stdout+result.stderr).includes('synthetic-private-token'));
 assert.match(readFileSync(join(target,'private-logs/install.stdout.log'),'utf8'),/synthetic-private-token/);
});
check('unsupported Node versions fail clearly before the installer and retain a prerequisite receipt',()=>{
 const target=nextCase(),result=verify(release(),target,'',true,'22.12.0');assert.notEqual(result.status,0);assert.match(result.stderr,/Node.js 24/);
 const receipt=JSON.parse(readFileSync(join(target,'verification-receipt.json'),'utf8'));assert.equal(receipt.nodeVersion,'22.12.0');assert.equal(receipt.failure.phase,'prerequisites');assert.equal(existsSync(join(target,'app')),false);
});
check('a hung fake installer has a bounded outer timeout and leaves failure evidence',()=>{
 const source=release(),target=nextCase();writeFileSync(join(source,'packaging/windows/install.ps1'),`param($ReleaseRoot,$InstallRoot,[Alias('Home')]$CaseHome,$Workspace,$Components)\nStart-Sleep -Seconds 60`);
 const started=Date.now(),result=verify(source,target,'-InstallTimeoutSeconds 10',true);assert.notEqual(result.status,0);assert(Date.now()-started<30000);
 const receipt=JSON.parse(readFileSync(join(target,'verification-receipt.json'),'utf8'));assert.equal(receipt.status,'failed');assert.equal(receipt.failure.phase,'install');assert.equal(receipt.cleanup,'no-host-receipt');assert.equal(receipt.processFailure.kind,'timeout');
});
check('timeout cleanup ignores descendants whose PID was reused after the CIM snapshot',()=>{
 const source=release(),target=nextCase();
 const command=`$ErrorActionPreference='Stop'; . ${quote(script)} -ReleaseRoot ${quote(source)} -ValidationRoot ${quote(target)} -DryRun | Out-Null
 $script:killed=@(); $start=[datetime]'2026-01-01T00:00:00Z'
 $wrapper=[pscustomobject]@{Id=9100;StartTime=$start;HasExited=$false};$wrapper|Add-Member ScriptMethod Refresh {}
 $rootProcess=[pscustomobject]@{Id=9100;StartTime=$start};$rootProcess|Add-Member ScriptMethod Kill {$script:killed+=$this.Id}
 $reused=[pscustomobject]@{Id=9200;StartTime=$start.AddSeconds(2)};$reused|Add-Member ScriptMethod Kill {$script:killed+=$this.Id}
 function Get-Process {param($Id) if($Id -eq 9100){$rootProcess}else{$reused}}
 function Get-CimInstance {param($ClassName,$Filter) if($Filter){[pscustomobject]@{ProcessId=9200;ParentProcessId=9100;CreationDate=$start.AddSeconds(2)}}else{[pscustomobject]@{ProcessId=9200;ParentProcessId=9100;CreationDate=$start.AddSeconds(1)}}}
 Stop-ValidationTree $wrapper
 ConvertTo-Json -InputObject @($script:killed)`;
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',command],{cwd:repo,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),[9100]);
});

function serviceRelease({badClient=false}={}){
 const source=release(),payload=join(source,'fixture-runtime');mkdirSync(payload,{recursive:true});
 for(const name of ['launch-config.ps1','stop-dsh.ps1'])copyFileSync(join(repo,'scripts/runtime',name),join(payload,name));
 writeFileSync(join(source,'packaging/windows/install.ps1'),`param($ReleaseRoot,$InstallRoot,[Alias('Home')]$CaseHome,$Workspace,$Components)
 New-Item -ItemType Directory -Path (Join-Path $InstallRoot 'scripts/runtime'),(Join-Path $InstallRoot 'node_modules/@deepseek-ai/dsh/lib') -Force|Out-Null
 Get-ChildItem -LiteralPath (Join-Path $ReleaseRoot 'fixture-runtime') -Filter '*.ps1' | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $InstallRoot 'scripts/runtime')}
 Copy-Item -LiteralPath (Join-Path $ReleaseRoot 'server.mjs') -Destination (Join-Path $InstallRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js')
 Write-Output 'fake package installation, no npm downloads'`);
 writeFileSync(join(payload,'start-dsh.ps1'),`param([Alias('Home')]$CaseHome,[Alias('Profile')]$CaseProfile,$Workspace,$StateRoot,[int]$Port,$Components)
 $ErrorActionPreference='Stop';. (Join-Path $PSScriptRoot 'launch-config.ps1')
 $root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
 $c=Resolve-OptDshLaunch -InstallRoot $root -Home $CaseHome -Profile $CaseProfile -Workspace $Workspace -StateRoot $StateRoot -Port $Port
 New-Item -ItemType Directory -Path $c.RuntimeDir -Force|Out-Null;[IO.File]::WriteAllText($c.PatchPath,'{}')
 $child=Start-Process -FilePath ${quote(process.execPath)} -ArgumentList @(('"'+$c.Entry+'"'),'--profile',$CaseProfile,'--patch',('"'+$c.PatchPath+'"'),'--port',"$Port",'--state',('"'+$StateRoot+'"')) -WindowStyle Hidden -WorkingDirectory $Workspace -RedirectStandardOutput (Join-Path $StateRoot 'fixture.stdout.log') -RedirectStandardError (Join-Path $StateRoot 'fixture.stderr.log') -PassThru
 $s=@{schemaVersion=1;pid=$child.Id;startedUtc=$child.StartTime.ToUniversalTime().ToString('o');entry=$c.Entry;home=$CaseHome;profile=$CaseProfile;workspace=$Workspace;stateRoot=$StateRoot;port=$Port}
 [IO.File]::WriteAllText($c.StatePath,($s|ConvertTo-Json));for($i=0;$i -lt 80;$i++){if(Test-Path -LiteralPath $c.LaunchPath){return};Start-Sleep -Milliseconds 100};throw 'fake server failed to start'`);
 writeFileSync(join(source,'server.mjs'),`
 import http from 'node:http';import{writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
 const a=process.argv.slice(2),arg=k=>a[a.indexOf(k)+1],port=Number(arg('--port')),state=arg('--state'),url='http://127.0.0.1:'+port;
 const ids=['optdsh-workbench','optdsh-agent-canvas'];
 const graph={entries:ids.map(id=>({id,url:${badClient?"'https://example.invalid/blocked?rev=1'":"'/clients/'+id+'.js?rev=1'"}}))};
 const server=http.createServer((req,res)=>{const p=new URL(req.url,url);if(p.pathname==='/'&&p.searchParams.get('token')==='synthetic-case-token'){res.writeHead(302,{'set-cookie':'fixture=synthetic-cookie; Path=/','location':'/'});res.end();return;}if(req.headers.cookie!=='fixture=synthetic-cookie'){res.writeHead(401);res.end();return;}if(p.pathname==='/'){res.setHeader('content-type','text/html');res.end('<script>globalThis["__DSH_BOOT__"] = '+JSON.stringify(graph)+'</script>');return;}if(p.pathname==='/api/optdsh-platform'){res.setHeader('content-type','application/json');res.end(JSON.stringify({core:'ready',components:['workbench','canvas','forms'].map(id=>({id,status:'ready'}))}));return;}res.end('register '+ids.join(' '));});
 server.listen(port,'127.0.0.1',()=>{mkdirSync(join(state,'.runtime'),{recursive:true});writeFileSync(join(state,'.runtime/web-launch.json'),JSON.stringify({pid:process.pid,url,authenticatedUrl:url+'/?token=synthetic-case-token'}));});setTimeout(()=>server.close(()=>process.exit(0)),180000).unref();`);
 return source;
}
check('fake release exercises install, cookie exchange, selected components, revisioned clients and owned cleanup',()=>{
 const target=nextCase(),result=verify(serviceRelease(),target,'-Components core,workbench,canvas,forms',true);assert.equal(result.status,0,result.stderr);
 const receipt=JSON.parse(readFileSync(join(target,'verification-receipt.json'),'utf8'));assert.equal(receipt.status,'passed');assert.equal(receipt.clients.length,2);assert.equal(receipt.cleanup,'owned-host-stopped-or-already-exited');assert(receipt.checks.includes('official-client-graph-and-revisioned-scripts'));assert(!(result.stdout+result.stderr+JSON.stringify(receipt)).includes('synthetic-case-token'));
});
check('bad client origin fails before fetching outside localhost and still stops the owned fake host',()=>{
 const target=nextCase(),result=verify(serviceRelease({badClient:true}),target,'-Components workbench',true);assert.notEqual(result.status,0);
 const receipt=JSON.parse(readFileSync(join(target,'verification-receipt.json'),'utf8'));assert.equal(receipt.status,'failed');assert.equal(receipt.phase,'client-graph');assert.equal(receipt.cleanup,'owned-host-stopped-or-already-exited');
});

check('Node26 is allowed past prerequisites without an upper-major cap',()=>{
 const source=release(),target=nextCase();
 const result=verify(source,target,'',true,'26.12.0');assert.notEqual(result.status,0);
 const receipt=JSON.parse(readFileSync(join(target,'verification-receipt.json'),'utf8'));
 assert.equal(receipt.nodeVersion,'26.12.0');assert.equal(receipt.failure.phase,'install');
});
