// Shared, deterministic protocol. No optical imports and no evaluation of code.
const scalarTypes = ['text','textarea','number','select','boolean'];
const types = new Set([...scalarTypes,'object','array','record','reference','multiselect','list','json']);
const forbidden = new Set(['__proto__','prototype','constructor']);
export const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const empty = x => x === undefined || x === null || (typeof x === 'string' && !x.trim());
export function check(ok,message,status=400) { if(!ok) throw Object.assign(new Error(message),{status}); }
export function ident(x) { check(typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(x) && !forbidden.has(x),'无效标识'); return x; }
const title = x => typeof x === 'string' && x.length > 0 && x.length <= 500;
function segments(path) { check(typeof path === 'string' && path.length < 500,'字段路径无效'); const s=path.replace(/^\//,'').split('/'); for(const key of s) ident(key); return s; }
export function lookup(root,path) { return segments(path).reduce((v,k)=>isObject(v)||Array.isArray(v)?v[k]:undefined,root); }
export function visible(field,root,parent=root) {
  if(!field.when) return true;
  const {path,equals,in:items}=field.when, value=lookup(path.startsWith('/')?root:parent,path);
  return items ? items.includes(value) : value === equals;
}
function condition(c) {
  if(c===undefined)return;
  check(isObject(c),'条件格式无效');segments(c.path);
  check((Object.hasOwn(c,'equals')?1:0)+(Object.hasOwn(c,'in')?1:0)===1,'条件需要 equals 或 in');
  const list=c.in || [c.equals];check(Array.isArray(list)&&list.length>0&&list.length<60&&list.every(x=>x===null||['string','number','boolean'].includes(typeof x)),'条件值无效');
}
export function options(field,form) {
  const raw=field.source ? form.resources?.[field.source]?.options || [] : field.options || [];
  return raw.map(x=>typeof x==='string'?{value:x,label:x}:x).filter(x=>!field.filter||Object.entries(field.filter).every(([k,v])=>x[k]===v));
}
export function validateForm(form) {
  check(isObject(form)&&[1,2].includes(form.version)&&title(form.title),'表单需使用 version: 1 或 2 并填写标题');
  for(const [id,source] of Object.entries(form.resources || {})) {
    ident(id);check(isObject(source)&&Array.isArray(source.options)&&source.options.length<=2000,'候选资源无效');
    const seen=new Set();for(const x of source.options){check(isObject(x)&&title(x.value)&&title(x.label)&&!seen.has(x.value),'候选项重复或无效');seen.add(x.value);}
  }
  let count=0;
  function fields(list,depth=0) {
    check(Array.isArray(list)&&list.length>0&&list.length<=100&&depth<9,'字段数量或嵌套深度超限');
    const ids=new Set();
    for(const f of list) {
      check(isObject(f),'字段定义无效');ident(f.id);check(!ids.has(f.id),'字段标识重复：'+f.id);ids.add(f.id);
      check(++count<=800 && types.has(f.type)&&title(f.label),'不支持的字段类型或缺少标签：'+f.id);
      check(form.version===2 || scalarTypes.includes(f.type),'结构化字段需要 version: 2');
      for(const k of ['help','placeholder','unit'])check(f[k]===undefined||(typeof f[k]==='string'&&f[k].length<=2000),'字段说明过长');
      check(f.required===undefined||typeof f.required==='boolean','required 应为布尔值');condition(f.when);
      check(f.nullable===undefined||typeof f.nullable==='boolean','nullable 应为布尔值');
      if(['object','array','record'].includes(f.type))fields(f.fields,depth+1);
      if(f.type==='list') {
        check(isObject(f.items)&&[...scalarTypes,'json'].includes(f.items.type),'列表元素需要基础类型或 JSON');
        fields([{...f.items,id:'item',label:f.items.label||'值'}],depth+1);
        for(const n of ['minItems','maxItems'])check(f[n]===undefined||(Number.isInteger(f[n])&&f[n]>=0&&f[n]<=1000),'列表长度无效');
      }
      if(['array','record'].includes(f.type)) {
        for(const n of ['minItems','maxItems'])check(f[n]===undefined||(Number.isInteger(f[n])&&f[n]>=0&&f[n]<=100),'行数限制无效');
        check((f.minItems||0)<=(f.maxItems??100),'行数边界倒置');
        for(const k of ['uniqueBy','ascendingBy'])if(f[k]!==undefined)check(f.fields.some(x=>x.id===f[k]),'约束引用未知列');
      }
      if(['select','record','reference','multiselect'].includes(f.type)) {
        if(f.source!==undefined){ident(f.source);check(form.resources?.[f.source],'缺少候选资源：'+f.source);}
        else check(Array.isArray(f.options)&&f.options.length>0&&f.options.length<=2000,'选项无效');
        const entries=options(f,form), seen=new Set();
        for(const x of entries){check(title(x.value)&&title(x.label)&&!seen.has(x.value),'选项重复或无效');seen.add(x.value);if(f.type==='record')ident(x.value);}
        if(f.filter)check(isObject(f.filter)&&Object.keys(f.filter).every(k=>!forbidden.has(k)),'候选筛选无效');
      }
      if(f.type==='number') {
        for(const n of ['min','max','exclusiveMin','exclusiveMax'])check(f[n]===undefined||Number.isFinite(f[n]),'数值边界无效');
        check(f.min===undefined||f.max===undefined||f.min<=f.max,'数值边界倒置');
      }
      rules(f.rules);
    }
  }
  function rules(list) {
    if(list===undefined)return;check(Array.isArray(list)&&list.length<=40,'规则数量超限');
    for(const r of list){check(isObject(r)&&['lessThan','excludes','disjoint'].includes(r.kind),'未知校验规则');segments(r.left);segments(r.right);if(r.by)ident(r.by);condition(r.when);}
  }
  check(Array.isArray(form.groups)&&form.groups.length>0&&form.groups.length<=30,'分组数量需为 1–30');
  const groups=new Set();for(const g of form.groups){ident(g.id);check(!groups.has(g.id)&&title(g.title),'分组重复或缺少标题');groups.add(g.id);}
  fields(form.groups.flatMap(g=>g.fields));rules(form.rules);
  return form;
}
export function issues(form,values,complete=false) {
  const errors=[];const fail=(path,message)=>errors.push({path,message});
  if(!isObject(values))return [{path:'',message:'答案必须为对象'}];
  function read(path,parent){return lookup(path.startsWith('/')?values:parent,path);}
  function rules(list,parent,path,active) {
    if(!active)return;
    for(const r of list || []) {
      if(!visible(r,values,parent))continue;
      const a=read(r.left,parent),b=read(r.right,parent);if(empty(a)||empty(b))continue;
      let ok=true;
      if(r.kind==='lessThan')ok=typeof a==='number'&&typeof b==='number'&&a<b;
      if(r.kind==='excludes')ok=Array.isArray(a)&&!a.includes(b);
      if(r.kind==='disjoint'){const aa=Array.isArray(a)?a:[],bb=Array.isArray(b)?b:[];ok=!aa.some(x=>bb.some(y=>r.by?x?.[r.by]===y?.[r.by]&&!empty(x?.[r.by]):x===y));}
      if(!ok)fail(r.left.startsWith('/')?r.left:path+'/'+r.left,r.message||'关联参数不满足约束');
    }
  }
  function walk(list,parent,path,active) {
    if(!isObject(parent)){fail(path,'需要参数对象');return;}
    const allowed=new Set(list.map(f=>f.id));for(const key of Object.keys(parent))if(!allowed.has(key))fail(path+'/'+key,'未知字段：'+key);
    for(const f of list) {
      const p=path+'/'+f.id,v=parent[f.id],on=active&&visible(f,values,parent);
      if(empty(v)){if(complete&&on&&f.required&&!(v===null&&f.nullable))fail(p,'请填写：'+f.label);continue;}
      if(f.type==='json') {
        try { check(JSON.stringify(v).length<=120000,'JSON过大');const visit=(x,d=0)=>{check(d<20,'JSON嵌套过深');if(typeof x==='number')check(Number.isFinite(x),'数值不是有限值');else if(x!==null&&typeof x==='object')for(const y of Object.values(x))visit(y,d+1);else check(x===null||['string','boolean'].includes(typeof x),'不支持的JSON值');};visit(v); }
        catch(e){fail(p,f.label+'：'+e.message);}continue;
      }
      if(f.type==='list') {
        if(!Array.isArray(v)){fail(p,f.label+'：需要列表');continue;}
        if(v.length>(f.maxItems??1000)||(complete&&on&&v.length<(f.minItems||0)))fail(p,f.label+'：列表长度不满足限制');
        for(let i=0;i<v.length;i++)walk([{...f.items,id:'value',label:f.items.label||f.label}],{value:v[i]},p+'/'+i,on);
        if(f.uniqueItems&&new Set(v.map(x=>JSON.stringify(x))).size!==v.length)fail(p,f.label+'：列表值不能重复');
        continue;
      }
      if(f.type==='object'){walk(f.fields,v,p,on);if(isObject(v))rules(f.rules,v,p,on);continue;}
      if(['array','record'].includes(f.type)) {
        if(f.type==='array'?!Array.isArray(v):!isObject(v)){fail(p,f.label+'：列表格式错误');continue;}
        const rows=Object.entries(v),validKeys=new Set(options(f,form).map(x=>x.value));
        if(rows.length>(f.maxItems??100)||(complete&&on&&rows.length<(f.minItems||0)))fail(p,f.label+'：行数不满足限制');
        const seen=new Set();let previous;
        for(const [k,row] of rows) {
          if(f.type==='record'&&!validKeys.has(k)){fail(p+'/'+k,'未知行：'+k);continue;}
          walk(f.fields,row,p+'/'+k,on);if(!isObject(row))continue;rules(f.rules,row,p+'/'+k,on);
          if(on&&f.uniqueBy&&!empty(row[f.uniqueBy])){if(seen.has(row[f.uniqueBy]))fail(p+'/'+k+'/'+f.uniqueBy,f.label+'：选择不能重复');seen.add(row[f.uniqueBy]);}
          if(on&&f.ascendingBy&&!empty(row[f.ascendingBy])){if(previous!==undefined&&row[f.ascendingBy]<=previous)fail(p+'/'+k+'/'+f.ascendingBy,f.label+'：数值必须按行严格递增');previous=row[f.ascendingBy];}
        }
        continue;
      }
      if(f.type==='number') {
        if(typeof v!=='number'||!Number.isFinite(v)||(f.integer&&!Number.isInteger(v))||(f.min!==undefined&&v<f.min)||(f.max!==undefined&&v>f.max)||(f.exclusiveMin!==undefined&&v<=f.exclusiveMin)||(f.exclusiveMax!==undefined&&v>=f.exclusiveMax))fail(p,f.label+'：数值类型或范围错误');
      } else if(f.type==='boolean') {if(typeof v!=='boolean')fail(p,f.label+'：需要是/否');}
      else if(f.type==='multiselect') {
        const choices=new Set(options(f,form).map(x=>x.value));
        if(!Array.isArray(v)||v.some(x=>!choices.has(x))||new Set(v).size!==v.length)fail(p,f.label+'：候选项无效或重复');
        else if(complete&&on&&f.required&&v.length===0)fail(p,'请填写：'+f.label);
      } else {
        if(typeof v!=='string'||v.length>10000)fail(p,f.label+'：文本类型错误或过长');
        else if(['select','reference'].includes(f.type)&&!options(f,form).some(x=>x.value===v))fail(p,f.label+'：选项已失效或无效');
      }
    }
  }
  walk(form.groups.flatMap(g=>g.fields),values,'',true);rules(form.rules,values,'',true);return errors;
}
export function validateValues(form,values,complete=false) {
  const errors=issues(form,values,complete);check(!errors.length,errors.map(x=>x.path+' '+x.message).slice(0,8).join('；'));return values;
}
export function activeValues(form,values) {
  function walk(fields,parent) {
    const result={};for(const f of fields){const v=parent?.[f.id];if(v===undefined||!visible(f,values,parent))continue;
      if(f.type==='object')result[f.id]=walk(f.fields,v);
      else if(f.type==='array')result[f.id]=(v||[]).map(row=>walk(f.fields,row));
      else if(f.type==='record')result[f.id]=Object.fromEntries(Object.entries(v||{}).map(([k,row])=>[k,walk(f.fields,row)]));
      else result[f.id]=v;
    }return result;
  }return walk(form.groups.flatMap(g=>g.fields),values);
}
export function summary(form,values) {
  const lines=[form.title];
  function walk(fields,parent,indent='') {
    for(const f of fields){if(!visible(f,values,parent))continue;const v=parent?.[f.id],label=indent+f.label;
      if(['object','array','record'].includes(f.type)) {
        lines.push(label+'：');
        if(f.type==='object')walk(f.fields,v||{},indent+'  ');
        else {const rows=Object.entries(v||{});if(!rows.length)lines.push(indent+'  未添加');for(const [k,row] of rows){lines.push(indent+'  '+(f.type==='record'?options(f,form).find(x=>x.value===k)?.label:k*1+1));walk(f.fields,row,indent+'    ');}}
      } else {const labels=options(f,form);const display=x=>labels.find(o=>o.value===x)?.label||String(x);lines.push(label+'：'+(f.type==='json'?JSON.stringify(v??null):empty(v)?'未填写 / 待确认':typeof v==='boolean'?(v?'是':'否'):Array.isArray(v)?v.map(display).join('、')||'未选择':display(v)+(f.unit?' '+f.unit:'')));}
    }
  }
  for(const g of form.groups){lines.push('','【'+g.title+'】');walk(g.fields,values);}return lines.join('\n');
}
