export const CANVAS_OPEN='<optdsh_canvas_context>';
export const CANVAS_CLOSE='</optdsh_canvas_context>';
/** Natural language is a separate content part; only the context block contains machine data. */
export function canvasMessage(note,context) {
  return [{type:'text',text:note||'请查看当前画板。'},
    {type:'text',text:CANVAS_OPEN+JSON.stringify(context)+CANVAS_CLOSE}];
}
