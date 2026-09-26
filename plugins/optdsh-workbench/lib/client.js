window.__ModuleLoader__.load({id:'optdsh-workbench',factory:require=>{
 const React=require('react'),h=React.createElement;
 const inject=['slots','sessions'];
 function apply(ctx){
  async function navigate(){
   const hash=new URLSearchParams(location.hash.slice(1));
   if(hash.has('optdsh-workbench')){location.replace('/api/optdsh-workbench/view');return;}
   const id=hash.get('optdsh-session');if(!id)return;
   try{await ctx.sessions.refresh();ctx.sessions.open(id);history.replaceState(null,'',location.pathname+location.search);}
   catch(e){console.error('无法打开工作台关联会话',e);}
  }
  ctx.effect(()=>{window.addEventListener('hashchange',navigate);void navigate();return()=>window.removeEventListener('hashchange',navigate);},'workbench session navigation');
  function Open({sessionId}){return h('a',{href:'/api/optdsh-workbench/view?session='+encodeURIComponent(sessionId),target:'_blank',rel:'noopener','data-open-optics':sessionId},'光学工作台 ↗');}
  ctx.effect(()=>ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'optdsh-workbench-open',order:36},Open)),'workbench entry');

 }
 return {inject,apply};
}});
