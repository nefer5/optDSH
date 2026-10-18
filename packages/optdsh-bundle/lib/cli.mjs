#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {compose} from './compose.mjs';
try {
 const {values,positionals}=parseArgs({allowPositionals:true,options:Object.fromEntries(['install-root','home','profile','workspace','state-root','components','output'].map(k=>[k,{type:'string'}]))});
 if(positionals.length!==1||positionals[0]!=='compose')throw new Error('Usage: optdsh-compose compose --install-root <app> --home <home> --workspace <cwd>');
 for(const k of ['install-root','home','workspace'])if(!values[k])throw new Error('Missing --'+k);
 console.log(JSON.stringify(compose({installRoot:values['install-root'],home:values.home,profile:values.profile,workspace:values.workspace,stateRoot:values['state-root'],components:values.components,output:values.output})));
} catch(e){console.error(e.message);process.exitCode=1;}
