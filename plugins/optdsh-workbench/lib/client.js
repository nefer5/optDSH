window.__ModuleLoader__.load({id:'optdsh-workbench',factory:require=>{
 const React=require('react'),h=React.createElement;
 const inject=['slots','sessions','uiWorkspace'];
 function apply(ctx){
  let navigation=0;
 async function navigate(){const turn=++navigation;
   const hash=new URLSearchParams(location.hash.slice(1));
   if(hash.has('optdsh-workbench')){location.replace('/api/optdsh-workbench/view');return;}
   const id=hash.get('optdsh-session');if(!id)return;
   try{
    await ctx.sessions.refresh();
    // During 0.2 startup a reconnect can supersede the initial refresh. Wait
    // for the catalog to actually contain the target before acquiring it.
    if(!ctx.sessions.list.getSnapshot().ids.includes(id))await new Promise((resolve,reject)=>{
     let unsubscribe=()=>{},timer;
     const finish=error=>{clearTimeout(timer);unsubscribe();error?reject(error):resolve();};
     const check=()=>{if(ctx.sessions.list.getSnapshot().ids.includes(id))finish();};
     timer=setTimeout(()=>finish(new Error('官方会话目录尚未包含目标会话，请稍后重试')),10000);
     unsubscribe=ctx.sessions.list.subscribe(check);check();
    });
    if(turn!==navigation)return;ctx.uiWorkspace.openSession(id);if(turn!==navigation)return;history.replaceState(null,'',location.pathname+location.search);
   }
   catch(e){console.error('无法打开工作台关联会话',e);}
  }
  ctx.effect(()=>{window.addEventListener('hashchange',navigate);void navigate();return()=>window.removeEventListener('hashchange',navigate);},'workbench session navigation');
  function Open({sessionId}){return h('a',{href:'/api/optdsh-workbench/view?session='+encodeURIComponent(sessionId),target:'_blank',rel:'noopener','data-open-optics':sessionId},'光学工作台 ↗');}
  ctx.effect(()=>ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'optdsh-workbench-open',order:36},Open)),'workbench entry');

 }
 return {inject,apply};
}});
