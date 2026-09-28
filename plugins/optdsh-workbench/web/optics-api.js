const ENDPOINT='/api/optdsh-workbench';
function responseError(response,result){const e=new Error((result.error?.code||response.status)+' · '+(result.error?.message||'请求失败'));e.code=result.error?.code;e.status=response.status;e.responseReceived=true;return e;}
export function submissionMessage(error){
 const rejected=new Set(['TX_CONFIG','TX_AUTH','STALE_REVISION','STALE_SNAPSHOT','NO_SNAPSHOT','HOST_BUSY','REQUEST_CONFLICT','INVALID_ARGUMENT','STALE_BINDING']);
 if(error.responseReceived&&rejected.has(error.code))return '未启动：'+error.message+'。请修正配置后重新提交。';
 return '提交状态待核实：'+error.message+'。请先查看作业列表，避免重复启动。';
}
export async function workbenchApi(action,data={}){
 const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,action})});
 const result=await response.json();if(!response.ok)throw responseError(response,result);return result;
}
export async function opticsApi(path,options={}){
 if(location.pathname.startsWith(ENDPOINT))return workbenchApi('optics',{path,method:options.method||'GET',data:options.body?JSON.parse(options.body):undefined});
 const response=await fetch(path,options),result=await response.json();if(!response.ok)throw responseError(response,result);return result;
}
export const fullSessionUrl=id=>'/#optdsh-session='+encodeURIComponent(id);
