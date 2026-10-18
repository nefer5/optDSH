#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {dirname,join} from 'node:path';
import {configureCanvas,findCanvas,installCanvas,ensureCanvas} from './canvas-installation.mjs';
try{
 const {values,positionals}=parseArgs({allowPositionals:true,options:{...Object.fromEntries(['home','root','tarball','install-root','npm-cli','port'].map(k=>[k,{type:'string'}])),'no-auto-start':{type:'boolean'}}});
 const [action]=positionals;if(positionals.length!==1||!['connect','install','ensure','discover'].includes(action))throw new Error('Use connect|install|ensure|discover --home <Home> [--root <AgentCanvas app>] [--tarball <tgz> --install-root <new folder>]');
 if(action==='discover')console.log(JSON.stringify(findCanvas({root:values.root})));
 else if(action==='ensure'){if(!values.home)throw new Error('Missing --home');console.log(JSON.stringify(await ensureCanvas(values.home)));}
 else{if(!values.home)throw new Error('Missing --home');let root=values.root;if(action==='install'){if(!values.tarball||!values['install-root'])throw new Error('Missing --tarball or --install-root');const info=installCanvas({tarball:values.tarball,installRoot:values['install-root'],npmCli:values['npm-cli']||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')});root=info.installationRoot;}const config=configureCanvas({home:values.home,root,port:values.port===undefined?4173:Number(values.port),autoStart:!values['no-auto-start']});console.log(JSON.stringify({status:'configured',...config}));}
}catch(error){console.error(error.message);process.exitCode=1;}
