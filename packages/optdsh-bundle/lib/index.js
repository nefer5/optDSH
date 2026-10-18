import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {homedir} from 'node:os';
export const name='optdsh-platform';
export const inject=['connection'];
export function apply(ctx,config={}){
 const stateRoot=resolve(config.stateRoot||resolve(process.env.DSH_HOME||resolve(homedir(),'.optdsh'),'state','web'));
 const capabilities=()=>{const entries=[...(ctx.get?.('loader')?.entries?.()||[])];return (config.optional||[]).map(item=>{if(item.unavailable)return {id:item.id,status:'unavailable',reason:item.unavailable};const entry=entries.find(e=>e.options.id===item.loaderId),state=entry?.fiber?.state;return {id:item.id,status:state===2?'ready':state===3?'failed':state===0||state===1?'loading':'unavailable',scopeState:state??null};});};
 const saveLaunch=()=>{const server=ctx.get?.('webServer');if(!server)return;const url='http://127.0.0.1:'+server.port;const file=resolve(stateRoot,'.runtime/web-launch.json');mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify({pid:process.pid,url,authenticatedUrl:ctx.connection.authenticatedUrl(url)}));renameSync(file+'.tmp',file);};
 const ready=ctx.get?.('loader')?.await();if(ready)ready.then(saveLaunch).catch(e=>ctx.logger?.warn?.('Launch receipt: '+e.message));else saveLaunch();
 ctx.effect(()=>ctx.connection.fetch.register({path:'/api/optdsh-platform',methods:['GET'],requestBody:'buffered',fetch:()=>Response.json({core:'ready',components:capabilities()})}),'platform capabilities');
}
