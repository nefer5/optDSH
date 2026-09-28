import {composeSlide} from './layouts.mjs';
export const FONTS=['黑体','等线','等线 Light','微软雅黑','微软雅黑 Light','楷体','仿宋'];
const aliases={SimHei:'黑体',DengXian:'等线','Microsoft YaHei':'微软雅黑',KaiTi:'楷体',FangSong:'仿宋'};
export function font(value='微软雅黑'){value=aliases[value]||value;if(!FONTS.includes(value))throw Error(`Unsupported font: ${value}`);return value;}
export function validate(deck){
 if(!deck || deck.version!==1 || !Array.isArray(deck.slides)||!deck.slides.length||deck.slides.length>50)throw Error('Expected version 1 deck, 1–50 slides');
 const ids=new Set();
 for(const s of deck.slides){if(!s.id||ids.has(s.id))throw Error('Duplicate/missing slide ID');ids.add(s.id);if(!Array.isArray(s.elements)||s.elements.length>200)throw Error('Invalid elements');
 for(const e of s.elements){if(!e.id||ids.has(e.id))throw Error('Duplicate/missing element ID');ids.add(e.id);if(!['text','shape','image','line','table','connector','group','chart','diagram','icon'].includes(e.type))throw Error(`Unsupported element: ${e.type}`);
 for(const k of ['x','y','w','h'])if(!Number.isFinite(e[k]))throw Error(`Invalid ${k}`);
 if(e.fontFamily)font(e.fontFamily);
 if(e.type==='image'&&!/^data:image\/(png|jpeg|webp);base64,/.test(e.src||''))throw Error('Images must be embedded PNG/JPEG/WebP data URLs');
 }}return deck;
}
const base=(id,x,y,w,h,z=1)=>({id,x,y,w,h,z,rotation:0});
export function text(id,value,x,y,w,h,f='微软雅黑',size=44){return {...base(id,x,y,w,h),type:'text',text:value,fontFamily:font(f),fontSize:size,fontWeight:400,italic:false,underline:false,strike:false,color:'#1e293b',align:'left',vAlign:'top',lineHeight:1.25,letterSpacing:0};}
export function fromPlan(plan,baseDir=process.cwd()){
 if(!Array.isArray(plan.slides))throw Error('Plan needs slides');
 const deck={version:1,title:plan.title||'演示文稿',slides:plan.slides.map((s,i)=>{
 if(s.layout)return composeSlide(s,i,plan.theme,baseDir);
 const prefix=`s${i+1}`;const elements=[text(prefix+'-title',s.title||'',100,65,1710,120,s.titleFont||'黑体',64)];
 if(s.body)elements.push(text(prefix+'-body',Array.isArray(s.body)?s.body.join('\n'):s.body,110,245,s.image?940:1660,570,s.font||'微软雅黑',44));
 if(s.image)elements.push({...base(prefix+'-image',1120,250,650,480,2),type:'image',src:s.image,fit:'contain',borderRadius:0});
 if(s.rows){const rows=s.rows;elements.push({...base(prefix+'-table',110,280,1680,520,2),type:'table',rows,hasHeader:true,fontSize:40,headerFill:'#245c50',headerTextColor:'#ffffff',rowFill:'#ffffff',textColor:'#1e293b',borderColor:'#b7c9c2',cellRuns:rows.map((r,i)=>r.map(v=>[{text:String(v),fontFamily:font(s.font),fontSize:40,color:i===0?'#ffffff':'#1e293b'}]))});}
 if(s.steps)s.steps.forEach((v,j)=>{elements.push({...base(prefix+'-box'+j,110+j*565,290,490,230),type:'shape',shape:'rect',fill:'#e4efe9',stroke:'#245c50',strokeWidth:2,opacity:1});elements.push(text(prefix+'-step'+j,v,140+j*565,335,430,160,s.font,42));if(j<s.steps.length-1)elements.push(text(prefix+'-arrow'+j,'→',610+j*565,355,60,70,'微软雅黑',48));});
 elements.push(text(prefix+'-footer',s.source||'合成演示材料 · 不代表真实业务数据',110,980,1650,55,'仿宋',28));
 return {id:prefix,background:'#fafaf7',elements,notes:s.notes||''};})};return validate(deck);
}
