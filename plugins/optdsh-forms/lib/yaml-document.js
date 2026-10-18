import {parseDocument,isMap,isSeq,isScalar,isAlias} from 'yaml';
export const yamlError=(message,status=400)=>Object.assign(new Error(message),{status});
const bad=(message,status)=>{throw yamlError(message,status);};
export const escapeKey=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
export function parseYaml(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>512000)bad('YAML超过512KB编辑限制，原文件保持不变。');
 const doc=parseDocument(text,{keepSourceTokens:true,uniqueKeys:true,intAsBigInt:true});
 if(doc.errors.length)bad(doc.errors[0].message);
 return doc;
}
function segments(path){if(typeof path!=='string'||path!==''&&!path.startsWith('/'))bad('无效字段路径');return path===''?[]:path.slice(1).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'));}
export function locateYaml(doc,path){
 let node=doc.contents,parent=null,pair=null,index=null;
 for(const part of segments(path)){
  parent=node;pair=null;index=null;
  if(isMap(node)){
   const found=node.items.filter(p=>isScalar(p.key)&&String(p.key.value)===part);
   if(found.length!==1)bad('字段已不存在或键存在歧义：'+path,409);
   pair=found[0];node=pair.value;
  }else if(isSeq(node)){
   if(!/^(0|[1-9]\d*)$/.test(part)||Number(part)>=node.items.length)bad('列表路径已失效：'+path,409);
   index=Number(part);node=node.items[index];
  }else bad('路径不能继续展开：'+path,409);
 }
 return {node,parent,pair,index};
}
const comment=x=>typeof x==='string'?x.trim():'';
export function yamlTree(doc){
 let count=0;
 function visit(node,path='',key='配置',keyNode=null,depth=0){
  if(++count>12000||depth>100)bad('配置结构超过编辑器展开限制，请缩小文件；原文未修改。');
  const out={path,key:String(key),kind:'scalar',value:null,valueType:'null',children:[],commentBefore:[keyNode?.commentBefore,node?.commentBefore].map(comment).filter(Boolean).join('\n'),comment:[keyNode?.comment,node?.comment].map(comment).filter(Boolean).join('\n')};
  const raw=()=>{out.kind='raw';out.rawText=String(node??'null');delete out.value;return out;};
  if(isAlias(node)||node?.tag)return raw();
  if(isMap(node)){
   const keys=node.items.map(p=>isScalar(p.key)?String(p.key.value):null);
   if(keys.includes(null)||new Set(keys).size!==keys.length)return raw();
   out.kind='map';out.valueType='object';delete out.value;out.children=node.items.map(p=>visit(p.value,path+'/'+escapeKey(p.key.value),p.key.value,p.key,depth+1));
  }else if(isSeq(node)){
   out.kind='seq';out.valueType='array';delete out.value;out.children=node.items.map((n,i)=>visit(n,path+'/'+i,String(i),null,depth+1));
  }else if(isScalar(node)){
   const value=node.value;
   if(typeof value==='bigint'){
    if(value<=BigInt(Number.MAX_SAFE_INTEGER)&&value>=BigInt(Number.MIN_SAFE_INTEGER)){out.value=Number(value);out.valueType='number';}
    else{out.value=value.toString();out.valueType='integer';}
   }else if(typeof value==='number'&&!Number.isFinite(value))return raw();
   else{out.value=value;out.valueType=value===null?'null':typeof value;}
  }
  return out;
 }
 return visit(doc.contents);
}
export function editYaml(text,input,focused=[]){
 const doc=parseYaml(text),{node,parent,pair,index}=locateYaml(doc,input.path);let focus=[...focused];
 function replace(next){if(node){next.comment=node.comment;next.commentBefore=node.commentBefore;}if(pair)pair.value=next;else if(isSeq(parent))parent.items[index]=next;else doc.contents=next;}
 if(input.op==='set'){
  if(node?.tag||isAlias(node))bad('特殊YAML节点请在原文区编辑，以保留语义。');
  let value=input.value;
  if(typeof node?.value==='bigint'&&typeof value==='string'&&/^[+-]?\d+$/.test(value))value=BigInt(value);
  if(typeof value==='number'&&(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value)))bad('数值超出无损编辑范围；请用原文区保留精确值。');
  if(typeof node?.value==='bigint'&&typeof value==='number'&&Number.isInteger(value))value=BigInt(value);
  if(isScalar(node)&&Object.is(node.value,value))return {yaml:text,focusPaths:focused};
  if(isScalar(node)&&!(value&&typeof value==='object'))node.value=value;
  else replace(doc.createNode(value));
 }else if(input.op==='add'){
  if(isMap(node)){
   if(typeof input.key!=='string'||!input.key.trim())bad('参数名不能为空');
   if(node.items.some(p=>isScalar(p.key)&&String(p.key.value)===input.key))bad('参数名已存在');
   node.add({key:input.key,value:doc.createNode(input.value??null)});
  }else if(isSeq(node))node.items.push(doc.createNode(input.value??null));else bad('只能向映射或列表添加项目');
 }else if(input.op==='rename'){
  if(!isMap(parent)||!pair||!isScalar(pair.key))bad('只有普通映射键支持改名');
  if(typeof input.key!=='string'||!input.key.trim())bad('参数名不能为空');
  if(parent.items.some(p=>p!==pair&&isScalar(p.key)&&String(p.key.value)===input.key))bad('参数名已存在');
  const next=input.path.slice(0,input.path.lastIndexOf('/')+1)+escapeKey(input.key);pair.key.value=input.key;
  focus=focus.map(p=>p===input.path?next:p.startsWith(input.path+'/')?next+p.slice(input.path.length):p);
 }else if(input.op==='remove'){
  if(!parent)bad('不能删除整个文档');
  if(isMap(parent))parent.items.splice(parent.items.indexOf(pair),1);else parent.items.splice(index,1);
  focus=focus.filter(p=>p!==input.path&&!p.startsWith(input.path+'/'));
  if(isSeq(parent)){const base=input.path.slice(0,input.path.lastIndexOf('/'));focus=focus.map(p=>{if(!p.startsWith(base+'/'))return p;const [head,...tail]=p.slice(base.length+1).split('/');return /^\d+$/.test(head)&&Number(head)>index?base+'/'+(Number(head)-1)+(tail.length?'/'+tail.join('/'):''):p;});}
 }else if(input.op==='replace'){replace(parseYaml(input.yaml).contents);}else bad('未知编辑操作');
 const yaml=doc.toString(),checked=parseYaml(yaml);yamlTree(checked);
 return {yaml,focusPaths:focus.filter(p=>{try{locateYaml(checked,p);return true;}catch{return false;}})};
}
