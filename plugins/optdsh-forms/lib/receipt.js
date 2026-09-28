import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function pageUrl(root,value){
  const relative='/api/optdsh-forms/view?'+new URLSearchParams({mode:value.mode,id:value.id,...(value.formId?{form:value.formId}:{})});
  try{const state=JSON.parse(readFileSync(resolve(root,'.runtime/web-launch.json'),'utf8')),base=new URL(state.url);if(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)&&!base.username&&!base.password)return new URL(relative,base).href;}catch{}
  return relative;
}
export function briefReceipt(value,command){
  if(!value.mode)return value;
  const result={id:value.id,mode:value.mode,status:value.status,url:value.url,storage:value.storage};
  if(command==='create')return {...result,initialValues:'保留输入文件或请求中已有的值，可能包含样例值和占位符；不是空白表单。',next:'用户填写并提交后，使用 read --id '+value.id+' --brief 读取。'};
  if(value.mode==='request'&&value.status!=='submitted')return {...result,ready:false,message:'用户尚未提交；不把草稿当作已确认配置。'};
  return {...result,ready:true,config:value.activeValues};
}
