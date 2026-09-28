import {text, font} from './model.mjs';
import {localImage, contain} from './assets.mjs';

export const DEFAULT_THEME = {background:'#FFFFFF', ink:'#334155', blue:'#607C94', muted:'#758396', line:'#C5D0DA', panel:'#F1F4F7', accent:'#843F46', titleFont:'黑体', bodyFont:'微软雅黑', bodySize:34};
export const LAYOUTS = ['analysis', 'comparison', 'patent-card'];
// Coordinates and typography are shared; content remains the author's responsibility.
export function composeSlide(s, index, theme = {}, baseDir) {
  const t = {...DEFAULT_THEME, ...theme}; font(t.titleFont); font(t.bodyFont);
  if (!LAYOUTS.includes(s.layout)) throw Error(`Unknown layout: ${s.layout}`);
  const p = s.id || `s${index + 1}`, elements = [];
  const addText = (key, value, x,y,w,h,size=t.bodySize,color=t.ink,bold=false) => {
    if (!value) return;
    elements.push({...text(`${p}-${key}`, Array.isArray(value)?value.join('\n'):String(value), x,y,w,h,t.bodyFont,size),color,fontWeight:bold?700:400});
  };
  const rect = (key,x,y,w,h,fill=t.panel,stroke=t.line) => elements.push({id:`${p}-${key}`,type:'shape',shape:'rect',x,y,w,h,z:0,rotation:0,fill,stroke,strokeWidth:1,opacity:1});
  addText('kicker',s.kicker || s.layout.toUpperCase(),94,38,1700,38,26,t.blue,true);
  elements.push({...text(`${p}-title`,s.title || '',94,90,1732,s.layout==='patent-card'?86:125,t.titleFont,s.layout==='patent-card'?52:58),color:t.ink,fontWeight:700});
  rect('rule',94,226,1732,2,t.line,t.line);
  const sections=s.sections || [];
  if(s.layout==='analysis') {
    if(sections.length<2 || sections.length>3) throw Error('analysis requires 2–3 sections');
    const gap=28,w=(1732-gap*(sections.length-1))/sections.length;
    sections.forEach((a,j)=>{
      const x=94+j*(w+gap); rect(`panel-${j}`,x,270,w,555);
      addText(`heading-${j}`,a.heading,x+26,300,w-52,95,40,t.blue,true);
      addText(`body-${j}`,a.body,x+26,420,w-52,375);
    });
    addText('takeaway',s.takeaway,94,865,1732,104,36,t.accent,true);
  } else if(s.layout==='comparison') {
    const rows=s.rows;
    if(!Array.isArray(rows)||rows.length<2||rows.length>5||!rows[0]?.length||rows[0].length>5||rows.some(r=>r.length!==rows[0].length)) throw Error('comparison requires rectangular rows: header + 1–4 rows, 1–5 columns');
    const cols=rows[0].length,w=1732/cols,bodyH=560/(rows.length-1);
    rows.forEach((row,i)=>row.forEach((v,j)=>{
      const y=i?344+(i-1)*bodyH:270,h=i?bodyH:74;
      rect(`cell-${i}-${j}`,94+j*w,y,w,h,i?(i%2?t.panel:t.background):t.blue);
      addText(`celltext-${i}-${j}`,v,110+j*w,y+16,w-32,h-24,i?t.bodySize:32,i?t.ink:'#FFFFFF',!i);
    }));
    addText('takeaway',s.takeaway,94,932,1732,65,32,t.accent,true);
  } else {
    if(sections.length<3 || sections.length>6) throw Error('patent-card requires 3–6 sections');
    if(!Array.isArray(s.images)||s.images.length<1||s.images.length>2) throw Error('patent-card requires 1–2 images');
    addText('meta',s.meta,94,187,1732,35,26,t.muted);
    const gap=12,h=(696-gap*(sections.length-1))/sections.length;
    sections.forEach((a,j)=>{const y=260+j*(h+gap);addText(`heading-${j}`,a.heading,94,y,910,42,30,t.blue,true);addText(`body-${j}`,a.body,94,y+45,910,h-45);});
    const vertical=s.imageArrangement==='vertical';
    s.images.forEach((a,j)=>{
      const x=1050+(vertical?0:j*(770/s.images.length)),y=vertical?274+j*338:300;
      const w=vertical?750:(750-(s.images.length-1)*20)/s.images.length,h=vertical?258:490;
      const src=localImage(a.path || a.src,baseDir);
      rect(`frame-${j}`,x,y,w,h,'#FFFFFF00');
      elements.push({id:`${p}-image-${j}`,type:'image',...contain(src,{x:x+14,y:y+14,w:w-28,h:h-28}),z:1,rotation:0,src,fit:'contain',borderRadius:0});
      addText(`caption-${j}`,a.caption,x,y+h+14,w,70,25,t.muted);
    });
    addText('image-note',s.imageNote,1050,904,750,64,27,t.muted);
  }
  addText('source',s.source,94,1010,1630,45,23,t.muted);
  addText('page',String(index+1).padStart(2,'0'),1750,1010,75,45,25,t.blue);
  return {id:p,background:t.background,elements,notes:s.notes || ''};
}
