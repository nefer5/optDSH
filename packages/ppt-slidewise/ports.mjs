import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
let home=process.env.DSH_HOME||process.env.OPTDSH_HOME;
if(!home)try{home=JSON.parse(readFileSync(resolve(import.meta.dirname,'../../optdsh-launcher.json'),'utf8').replace(/^\uFEFF/,'' )).home;}catch{}
let configured;try{configured=JSON.parse(readFileSync(resolve(home||resolve(homedir(),'.optdsh'),'config/ports.json'),'utf8')).ppt?.port;}catch{}
export const PPT_PORT=Number(process.env.PPT_SLIDEWISE_PORT||configured||3314);
if(!Number.isSafeInteger(PPT_PORT)||PPT_PORT<1024||PPT_PORT>65535)throw Error('PPT端口必须为1024到65535的整数');
export const PPT_ORIGIN='http://127.0.0.1:'+PPT_PORT;
