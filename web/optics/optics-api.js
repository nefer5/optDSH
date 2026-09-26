const ENDPOINT='/api/optdsh-workbench';
export async function workbenchApi(action,data={}){
 const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,action})});
 const result=await response.json();if(!response.ok)throw new Error((result.error?.code||response.status)+' · '+(result.error?.message||'请求失败'));return result;
}
export async function opticsApi(path,options={}){
 if(location.pathname.startsWith(ENDPOINT))return workbenchApi('optics',{path,method:options.method||'GET'});
 const response=await fetch(path,options),result=await response.json();if(!response.ok)throw new Error(result.error?.message||'请求失败');return result;
}
export const fullSessionUrl=id=>'/#optdsh-session='+encodeURIComponent(id);
