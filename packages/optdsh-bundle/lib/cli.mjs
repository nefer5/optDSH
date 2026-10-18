#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {compose} from './compose.mjs';
import {canvasProfileState} from './profile-components.mjs';
try {
 const {values,positionals}=parseArgs({allowPositionals:true,options:Object.fromEntries(['install-root','home','profile','workspace','state-root','components','output','canvas-unavailable'].map(k=>[k,{type:'string'}]))});
 if(positionals.length!==1||!['compose','canvas-profile-state'].includes(positionals[0]))throw new Error('Usage: optdsh-compose compose|canvas-profile-state --install-root <app> --home <home>');
 if(positionals[0]==='canvas-profile-state'){
  if(!values['install-root']||!values.home)throw new Error('Missing installation root or Home');
  console.log(JSON.stringify(canvasProfileState({installRoot:values['install-root'],home:values.home,profile:values.profile})));process.exit(0);
 }
 for(const k of ['install-root','home','workspace'])if(!values[k])throw new Error('Missing --'+k);
 console.log(JSON.stringify(compose({installRoot:values['install-root'],home:values.home,profile:values.profile,workspace:values.workspace,stateRoot:values['state-root'],components:values.components,output:values.output,canvasUnavailable:values['canvas-unavailable']})));
} catch(e){console.error(e.message);process.exitCode=1;}
