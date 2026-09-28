// Register only on the bound agent's Cordis scope; unrelated chats stay untouched.
export function createOpticalPolicy(text){
 const installed=new WeakSet();
 return (agent,bindings)=>{
  if(!agent||!bindings[agent.session.id]||installed.has(agent))return false;
  agent.ctx.systemPrompt.section({name:'optdsh:optical-collaboration',order:70,text});
  installed.add(agent);
  return true;
 };
}
