// Browser-local delivery echoes; never a second authoritative conversation log.
export class ChatState {
 constructor(){this.sessionId=null;this.state={messages:[],queue:[]};this.pending=new Map();}
 select(id){this.sessionId=id;this.state={sessionId:id,messages:[],queue:[]};}
 accept(state){if(state.sessionId!==this.sessionId)return false;this.state=state;const observed=new Set([...state.messages,...(state.queue||[])].map(m=>m.requestId));for(const id of observed)this.pending.delete(id);return true;}
 echo(sessionId,requestId,text){this.pending.set(requestId,{seq:'pending:'+requestId,sessionId,requestId,role:'user',text,context:[],delivery:'发送中…'});}
 delivered(id){const m=this.pending.get(id);if(m)m.delivery='已提交，等待会话接收';}
 failed(id,message){const m=this.pending.get(id);if(m)m.delivery=message;}
 messages(){return [...this.state.messages,...(this.state.queue||[]),...[...this.pending.values()].filter(m=>m.sessionId===this.sessionId)];}
}
