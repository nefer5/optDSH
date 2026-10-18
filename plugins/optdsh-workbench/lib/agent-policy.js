// Register only on the bound agent's Cordis scope; unrelated chats stay untouched.
export function createOpticalPolicy(text){
 const installed=new WeakSet(),disposers=new Set();
 const install=(agent,bindings)=>{
  if(!agent||!bindings[agent.session.id]||installed.has(agent))return false;
  const dispose=agent.ctx.systemPrompt.section({name:'optdsh:optical-collaboration',order:70,text});
  if(typeof dispose==='function')disposers.add(dispose);
  installed.add(agent);
  return true;
 };
 install.dispose=()=>{for(const dispose of disposers)dispose();disposers.clear();};
 return install;
}
