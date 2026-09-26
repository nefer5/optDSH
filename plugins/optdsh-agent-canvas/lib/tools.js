import {defineTool} from '@deepseek-ai/dsh-tools';
import {sceneContext,requireValue} from './boards.js';

const output={schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
const number={type:'number'};
export function registerCanvasTools(ctx,store,binding) {
  async function bound(exec) {
    exec.signal.throwIfAborted();
    requireValue(exec.agent&&ctx.agents.get(exec.agent.id)===exec.agent,'Canvas tools require the exact calling Agent');
    const b=await binding(exec.agent.session.id);exec.signal.throwIfAborted();return b;
  }
  ctx.tools.register(defineTool({
    name:'canvas_read',description:'Read the current DSH conversation’s own editable canvas, revision and exact element IDs. Use before drawing/editing. This is the native embedded canvas, NOT agent-canvas CLI or the shared inbox. Canvas coordinates are pixels, not optical coordinates.',
    parameters:{},output,
    async execute(_args,exec) {
      const b=await bound(exec);
      return {boardId:b.boardId,revision:b.revision,...sceneContext(b.scene||{elements:[]},''),
        proposals:b.edits.map(x=>({id:x.id,summary:x.summary,status:x.status})),
        next:'Use canvas_propose_edit to draw/update. A proposal is only applied when the user clicks Preview / Apply in the canvas.'};
    }
  }));
  ctx.tools.register(defineTool({
    name:'canvas_propose_edit',description:'Collaboratively edit this conversation’s draft canvas using 1–50 operations. First canvas_read for baseRevision and exact IDs. You MAY modify or delete user-drawn elements, including shapes with bound labels. Move the original using update, NEVER copy it as a substitute for moving. Bound labels and connector endpoints follow their owner automatically; deleting an owner removes its label and detaches connectors. Add rectangle/ellipse/diamond/text/arrow/line; update/delete existing elements including images and freedraw. x/y are pixel positions; width/height are dimensions; text edits a text element or a shape’s bound label; endX/endY change line endpoints. User previews/applies proposals. No CLI or shell needed.',
    parameters:{
      baseRevision:{type:'integer',required:true},summary:{type:'string',required:true},
      operations:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{
        op:{type:'string',required:true,enum:['add','update','delete']},id:{type:'string'},
        type:{type:'string',enum:['rectangle','ellipse','diamond','text','line','arrow']},
        x:number,y:number,width:number,height:number,endX:number,endY:number,angle:number,
        text:{type:'string'},fontSize:number,strokeWidth:number,strokeColor:{type:'string'},backgroundColor:{type:'string'},locked:{type:'boolean'}
      }}}
    },output,
    async execute(args,exec) {
      const b=await bound(exec),proposal=store.proposeEdit(b,args,exec.callId);
      return {proposalId:proposal.id,status:proposal.status,baseRevision:proposal.baseRevision,changed:proposal.changed,
        message:'建议稿已生成，可在当前画板下方预览并应用。原画板尚未修改；不要调用CLI complete。'};
    }
  }));
}
