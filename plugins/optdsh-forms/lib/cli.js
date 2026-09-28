import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parse} from 'yaml';
import {FormStore} from './store.js';
import {importYaml,exportYaml} from './yaml-input.js';
import {pageUrl,briefReceipt} from './receipt.js';
// Uses the same locked store as the HTTP plugin; does not need a model call.
const args = process.argv.slice(2), command = args.shift();
const option = name => { const i=args.indexOf('--'+name); return i<0?undefined:args[i+1]; };
try {
  const store = new FormStore(resolve(option('root') || resolve(import.meta.dirname,'../../..')));
  let value;
  if(command === 'create' && option('config')) value = store.create(importYaml(option('config'),{formFile:option('form'),title:option('title')}));
  else if(command === 'create' && option('input')) value = store.create(parse(readFileSync(resolve(option('input')),'utf8'),{maxAliasCount:0}));
  else if(command === 'read' && option('id')) value = store.get(option('mode') || 'request',option('id'),option('form'));
  else if(command === 'list') value = {studies:store.list()};
  else if(command === 'export' && option('id') && option('output')) value=exportYaml(store.get('request',option('id')),option('output'));
  else throw new Error('用法：create --config old.yaml [--form ui.yaml] | create --input request.yaml | read --id ID | export --id ID --output new.yaml | list');
  if(value.id&&value.mode) value.url = pageUrl(store.root,value);
  if(args.includes('--brief'))value=briefReceipt(value,command);
  console.log(JSON.stringify(value,null,2));
} catch(e) { console.error(e.message); process.exitCode=1; }
