import {visible,options,lookup} from './schema.js';
// Hosts may register a packaged widget for an existing data type. Study files
// select a widget by name; they cannot load scripts or change validation.
const widgets=new Map();
const jsonDrafts=new WeakMap();
export function invalidJson(root){return [...(jsonDrafts.get(root)||new Map()).keys()].map(path=>({path,message:'JSON尚未完整，请修正后保存。'}));}
function removeDraftRow(root,path,key,indexed){const drafts=jsonDrafts.get(root);if(!drafts)return;const affected=[...drafts.entries()].filter(([p])=>p.startsWith(path+'/'));for(const [p]of affected)drafts.delete(p);for(const [p,text]of affected){const [row,...tail]=p.slice(path.length+1).split('/');if(row===String(key))continue;const shifted=indexed&&Number(row)>Number(key)?String(Number(row)-1):row;drafts.set(path+'/'+[shifted,...tail].join('/'),text);}}
export function registerWidget(name,render){if(widgets.has(name))throw new Error('控件重复：'+name);widgets.set(name,render);}
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
const domId=path=>'field-'+path.replaceAll('/','--');
export function setValue(root,path,value){const parts=path.slice(1).split('/');let x=root;for(const p of parts.slice(0,-1))x=x[p]??= {};x[parts.at(-1)]=value===undefined?null:value;}
export function renderFields({fields,root,form,path='',parent=root,disabled=false,onChange,onStructure}) {
  const fragment=document.createDocumentFragment();
  for(const f of fields){if(!visible(f,root,parent))continue;
    const p=path+'/'+f.id,ctx={f,path:p,root,form,value:lookup(root,p),disabled,onChange,onStructure};
    const render=widgets.get(f.widget||f.type);if(!render)throw new Error('未安装的表单控件：'+(f.widget||f.type));
    const node=render(ctx);node.dataset.path=p;fragment.append(node);
  }return fragment;
}
function heading(f,path){const title=el('div','field-label',f.label);title.id=domId(path)+'-label';if(f.required)title.append(el('span','required','*'));if(f.unit)title.append(el('span','unit',f.unit));return title;}
function help(f,node){if(f.help)node.append(el('small','field-help',f.help));}
function change(ctx,value,structural=false){setValue(ctx.root,ctx.path,value);ctx.onChange();if(structural)ctx.onStructure();}
function scalar(ctx){
  const {f,path,value,form,disabled}=ctx,node=el('div','field scalar'),title=heading(f,path);node.append(title);
  const input=el(f.type==='textarea'?'textarea':['select','reference','boolean'].includes(f.type)?'select':'input');
  input.id=domId(path);input.name=path;input.setAttribute('aria-labelledby',title.id);input.disabled=disabled;input.required=!!f.required;
  if(['select','reference','boolean'].includes(f.type)){
    const entries=f.type==='boolean'?[{value:'true',label:'是'},{value:'false',label:'否'}]:options(f,form);
    for(const o of [{value:'',label:'请选择 / 待确认'},...entries]){const x=el('option','',o.label);x.value=o.value;input.append(x);}
  }else if(f.type==='number'){input.type='number';input.step=f.integer?'1':'any';if(f.min!==undefined)input.min=f.min;if(f.max!==undefined)input.max=f.max;}
  else if(f.type==='text')input.type='text';
  input.value=value??'';input.placeholder=f.placeholder||'';
  input.addEventListener('input',()=>{let v=input.value===''?null:f.type==='number'?Number(input.value):f.type==='boolean'?input.value==='true':input.value;change(ctx,v);node.classList.remove('invalid');node.querySelector('.error')?.remove();});
  if(['select','reference','boolean'].includes(f.type))input.addEventListener('change',()=>ctx.onStructure());
  node.append(input);help(f,node);return node;
}
function multi(ctx){
  const {f,path,value,form,disabled}=ctx,node=el('fieldset','field multiselect'),title=el('legend','field-label',f.label);node.append(title);
  for(const o of options(f,form)){const label=el('label','check-option'),input=el('input');input.type='checkbox';input.value=o.value;input.checked=(value||[]).includes(o.value);input.disabled=disabled;
    input.onchange=()=>{const selected=new Set(lookup(ctx.root,path)||[]);input.checked?selected.add(o.value):selected.delete(o.value);change(ctx,[...selected]);};label.append(input,document.createTextNode(o.label));node.append(label);}
  help(f,node);return node;
}
function object(ctx){const {f,path,value}=ctx,node=el('fieldset','object-group');node.append(el('legend','',f.label));help(f,node);const grid=el('div','field-grid');grid.append(renderFields({...ctx,fields:f.fields,parent:value||{},path}));node.append(grid);return node;}
function collection(ctx){
  const {f,path,value,root,form,disabled}=ctx,node=el('section','collection'),head=el('div','collection-head');head.append(heading(f,path));
  const rows=Object.entries(value||{}),limit=f.maxItems??100;
  if(f.type==='record') {
    const chooser=el('select','row-key');chooser.setAttribute('aria-label','添加'+f.label);chooser.disabled=disabled||rows.length>=limit;
    const unused=options(f,form).filter(o=>!Object.hasOwn(value||{},o.value));
    for(const o of [{value:'',label:'＋ 选择要添加的行'},...unused]){const op=el('option','',o.label);op.value=o.value;chooser.append(op);}
    chooser.onchange=()=>{if(chooser.value)change(ctx,{...(lookup(root,path)||{}),[chooser.value]:{}},true);};head.append(chooser);
  } else {const add=el('button','secondary compact',f.addLabel||'＋ 添加一行');add.type='button';add.disabled=disabled||rows.length>=limit;add.onclick=()=>change(ctx,[...(lookup(root,path)||[]),{}],true);head.append(add);}
  node.append(head);help(f,node);
  const remove=k=>{const next=structuredClone(lookup(root,path));if(f.type==='array')next.splice(Number(k),1);else delete next[k];removeDraftRow(root,path,k,f.type==='array');change(ctx,next,true);};
  const tableMode=f.type==='record'||f.layout==='table';
  if(!rows.length&&!tableMode)node.append(el('div','empty-rows','尚未添加。使用上方按钮逐项填写。'));
  if(tableMode){
    const scroll=el('div','table-scroll'),table=el('table','parameter-table'),thead=el('thead'),tr=el('tr');tr.append(el('th','',f.type==='record'?'项目 / 单位':'行'));
    const columns=f.fields.filter(field=>rows.length?rows.some(([,row])=>visible(field,root,row)):visible(field,root,{}));for(const field of columns)tr.append(el('th','',field.label+(field.unit?' / '+field.unit:'')));tr.append(el('th','','操作'));thead.append(tr);table.append(thead);
    const body=el('tbody');for(const [k,row] of rows){const line=el('tr'),key=options(f,form).find(o=>o.value===k);line.append(el('th','row-label',f.type==='record'?(key?.label||k)+(key?.unit?' / '+key.unit:''):String(Number(k)+1)));
      for(const field of columns){const cell=el('td');cell.append(renderFields({...ctx,fields:[field],parent:row,path:path+'/'+k}));line.append(cell);}
      const cell=el('td'),button=el('button','remove-row','移除');button.type='button';button.disabled=disabled;button.setAttribute('aria-label','移除'+f.label+'第'+(Number.isFinite(Number(k))?Number(k)+1:k)+'行');button.onclick=()=>remove(k);cell.append(button);line.append(cell);body.append(line);
    }if(!rows.length){const line=el('tr'),cell=el('td','empty-rows','尚未添加。使用上方按钮逐项填写。');cell.colSpan=columns.length+2;line.append(cell);body.append(line);}table.append(body);scroll.append(table);node.append(scroll);
  } else for(const [k,row] of rows){const card=el('article','item-card'),bar=el('div','item-head');bar.append(el('strong','',f.itemLabel?f.itemLabel+' '+(Number(k)+1):'第 '+(Number(k)+1)+' 项'));const button=el('button','remove-row','移除');button.type='button';button.disabled=disabled;button.setAttribute('aria-label','移除'+f.label+'第'+(Number(k)+1)+'行');button.onclick=()=>remove(k);bar.append(button);card.append(bar);
    const grid=el('div','field-grid');grid.append(renderFields({...ctx,fields:f.fields,parent:row,path:path+'/'+k}));card.append(grid);node.append(card);
  }return node;
}
for(const type of ['text','textarea','number','select','reference','boolean'])registerWidget(type,scalar);
registerWidget('multiselect',multi);registerWidget('object',object);registerWidget('array',collection);registerWidget('record',collection);

function jsonWidget(ctx){
  const {f,path,value,disabled}=ctx,node=el('div','field json-field'),title=heading(f,path),input=el('textarea'),owner=ctx.draftRoot||ctx.root,slot=ctx.draftPath||path;
  if(!jsonDrafts.has(owner))jsonDrafts.set(owner,new Map());const drafts=jsonDrafts.get(owner);
  input.id=domId(path);input.name=path;input.setAttribute('aria-labelledby',title.id);input.disabled=disabled;input.value=drafts.get(slot)??JSON.stringify(value??null,null,2);input.spellcheck=false;
  if(drafts.has(slot)){input.setCustomValidity('请填写有效 JSON');node.classList.add('invalid');}
  input.oninput=()=>{try{const v=input.value.trim()===''?null:JSON.parse(input.value);drafts.delete(slot);input.setCustomValidity('');node.classList.remove('invalid');node.querySelector('.error')?.remove();change(ctx,v);}catch{drafts.set(slot,input.value);input.setCustomValidity('请填写有效 JSON');node.classList.add('invalid');if(!node.querySelector('.error'))node.append(el('small','error','JSON尚未完整，保存前请修正。'));ctx.onChange();}};
  node.append(title,input);help(f,node);return node;
}
function listWidget(ctx){
  const {f,path,value,disabled}=ctx,node=el('section','collection scalar-list'),head=el('div','collection-head'),add=el('button','secondary compact',f.addLabel||'＋ 添加值');add.type='button';add.disabled=disabled||(value||[]).length>=(f.maxItems??1000);add.onclick=()=>change(ctx,[...(lookup(ctx.root,path)||[]),null],true);head.append(heading(f,path),add);node.append(head);help(f,node);
  const rows=el('div','scalar-list-rows');
  for(const [i,v] of (value||[]).entries()){
    const line=el('div','scalar-list-row'),local={value:v},field={...f.items,id:'value',label:(f.items.label||f.label)+' '+(i+1),nullable:true};
    const child={...ctx,f:field,path:'/value',root:local,value:v,draftRoot:ctx.root,draftPath:path+'/'+i,onChange:()=>{const values=[...(lookup(ctx.root,path)||[])];values[i]=local.value;change(ctx,values);},onStructure:ctx.onStructure};
    const input=widgets.get(field.type)(child);input.dataset.path=path+'/'+i;const control=input.querySelector('input,select,textarea');if(control){const title=input.querySelector('.field-label');control.id=domId(path+'/'+i);control.name=path+'/'+i;if(title){title.id=control.id+'-label';control.setAttribute('aria-labelledby',title.id);}}
    const remove=el('button','remove-row','移除');remove.type='button';remove.disabled=disabled;remove.setAttribute('aria-label','移除'+f.label+'第'+(i+1)+'项');remove.onclick=()=>{const values=[...(lookup(ctx.root,path)||[])];values.splice(i,1);removeDraftRow(ctx.root,path,i,true);change(ctx,values,true);};line.append(input,remove);rows.append(line);
  }if(!value?.length)rows.append(el('div','empty-rows','列表为空；可添加值。'));node.append(rows);return node;
}
registerWidget('json',jsonWidget);registerWidget('list',listWidget);
