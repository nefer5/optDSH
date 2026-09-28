import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {parseDocument,parse,stringify} from 'yaml';
import {validateForm,validateValues,ident,isObject,check} from '../shared/schema.js';

const validKey=key=>{try{ident(key);return true;}catch{return false;}};
const kind=x=>x===null?'null':Array.isArray(x)?'array':isObject(x)?'object':typeof x;
/** Infer only shape and JS value type. Never infer enums, units or domain bounds. */
export function inferForm(config,{title='YAML 参数填写',description=''}={}) {
  function field(id,samples,depth=0){
    const nonnull=samples.filter(x=>x!==null&&x!==undefined),kinds=new Set(nonnull.map(kind)),base={id,label:id,nullable:samples.includes(null)};
    const fallback=help=>({...base,type:'json',help});
    if(!nonnull.length)return fallback('原值为 null，类型尚未确定；保留 null 或输入 JSON 值。');
    if(depth>6||kinds.size!==1)return fallback('值类型混合或嵌套较深；使用 JSON 保留原始结构。');
    const type=[...kinds][0];
    if(type==='number')return {...base,type:'number'};
    if(type==='boolean')return {...base,type:'boolean'};
    if(type==='string')return {...base,type:nonnull.some(x=>x.includes('\n')||x.length>120)?'textarea':'text'};
    if(type==='object'){
      const keys=[...new Set(nonnull.flatMap(Object.keys))];
      if(!keys.length||keys.length>90||!keys.every(validKey))return fallback('对象字段无法安全展开；原始对象可用 JSON 编辑。');
      return {...base,type:'object',fields:keys.map(key=>field(key,nonnull.filter(x=>Object.hasOwn(x,key)).map(x=>x[key]),depth+1))};
    }
    if(type==='array'){
      const items=nonnull.flat();
      if(nonnull.some(x=>x.length>1000))return fallback('列表较长，采用 JSON 编辑以保留全部数据。');
      if(items.length&&items.every(isObject)&&nonnull.every(x=>x.length<=100)){
        const row=field('row',items,depth+1);
        if(row.type==='object')return {...base,type:'array',layout:row.fields.every(f=>!['object','array','record'].includes(f.type))?'table':'cards',fields:row.fields};
      }
      const item=field('value',items,depth+1);const primitive=['text','textarea','number','boolean','json'].includes(item.type)?item:{type:'json',help:'嵌套列表项以 JSON 保留。'};
      const {id:unused,label:unusedLabel,...spec}=primitive;
      return {...base,type:'list',items:{...spec,label:'值',required:items.length>0&&!items.includes(null)},maxItems:1000,help:items.length?'按原始列表顺序保存。':'空列表未提供元素类型；新元素使用 JSON，不猜测结构。'};
    }
    return fallback('使用 JSON 编辑原始值。');
  }
  let wrapped=!isObject(config)||!Object.keys(config).length||!Object.keys(config).every(validKey)||Object.keys(config).length>90;
  let groups;
  if(wrapped)groups=[{id:'configuration',title:'原始配置',fields:[{id:'configuration',label:'配置',type:'json'}]}];
  else{
    const fields=Object.entries(config).map(([id,v])=>field(id,[v]));
    const scalars=fields.filter(f=>!['object','array','list'].includes(f.type));
    const structured=fields.filter(f=>['object','array','list'].includes(f.type));
    groups=[...(scalars.length?[{id:'basic',title:'基本参数',fields:scalars}]:[]),...structured.map((f,i)=>({id:'section'+i,title:f.label,fields:[f]}))];
    if(groups.length>30){wrapped=true;groups=[{id:'configuration',title:'原始配置',fields:[{id:'configuration',label:'配置',type:'json'}]}];}
  }
  const form={version:2,title,description:description||'根据现有 YAML 自动生成。保留原字段名；未推断单位、可选值或业务约束。',groups};
  const values=wrapped?{configuration:config}:config;
  validateForm(form);validateValues(form,values);return {form,values,wrapped};
}
export function importYaml(file,{formFile,title}={}){
  const source=resolve(file),bytes=readFileSync(source);check(bytes.length<=120000,'配置超过当前导入限制（120 KB）');
  const document=parseDocument(bytes.toString('utf8'));check(!document.errors.length,document.errors[0]?.message||'YAML 格式错误');check(!document.warnings.length,'YAML 包含未支持的标签或版本，不能无损导入');
  const config=document.toJS({maxAliasCount:0});check(config!==undefined,'YAML 为空');
  // YAML timestamps/NaN/infinity/custom objects must not be silently normalized.
  const jsonCheck=x=>{check(x===null||['string','boolean','number','object'].includes(typeof x),'不支持的 YAML 类型');if(typeof x==='number')check(Number.isFinite(x),'YAML 包含非有限数值');if(x&&typeof x==='object'){check(Array.isArray(x)||Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null,'YAML 对象类型不支持');for(const v of Object.values(x))jsonCheck(v);}};jsonCheck(config);
  const selected=formFile&&resolve(formFile);
  let result;
  if(selected){const form=validateForm(parse(readFileSync(selected,'utf8'),{maxAliasCount:0}));validateValues(form,config);result={form,values:config,wrapped:false};}
  else result=inferForm(config,{title:title||basename(source).replace(/\.ya?ml$/i,'')+' · 参数填写',description:'直接载入 '+basename(source)+'。字段按原类型生成；未推断单位、枚举或业务规则。原文件不修改。'+(document.commentBefore?' 原文件说明：'+document.commentBefore.trim().slice(0,600):'')});
  return {...result,caller:'YAML 直接填写',origin:{kind:'yaml-import',path:source,sha256:createHash('sha256').update(bytes).digest('hex'),inferred:!selected,wrapped:result.wrapped,formFile:selected||null}};
}
export function exportYaml(record,output){
  check(record.mode==='request'&&record.status==='submitted','仅可导出已提交的请求；pending 草稿不代表用户确认');
  check(typeof output==='string'&&/\.ya?ml$/i.test(output),'输出需要新的 .yaml 或 .yml 文件');
  const target=resolve(output);check(!existsSync(target),'输出文件已存在，不覆盖原配置');
  const config=record.origin?.wrapped?record.activeValues.configuration:record.activeValues;
  check(config!==undefined,'配置为空');const text='# 由已提交的表单导出；仅信息采集，不代表业务校验或执行授权。\n'+stringify(config);
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text,{encoding:'utf8',flag:'wx'});
  return {id:record.id,status:record.status,output:target,source:record.origin?.path||null};
}
