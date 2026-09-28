import {serializeDeck,type Deck} from '@textcortex/slidewise';
import JSZip from 'jszip';
const names:Record<string,string>={'黑体':'SimHei','等线':'DengXian','等线 Light':'DengXian Light','微软雅黑':'Microsoft YaHei','微软雅黑 Light':'Microsoft YaHei Light','楷体':'KaiTi','仿宋':'FangSong'};
export async function exportDeck(deck:Deck){
 const zip=await JSZip.loadAsync(await (await serializeDeck(deck)).arrayBuffer());
 // Preserve the selected typeface for CJK and complex-script runs, not just Latin.
 for(const name of Object.keys(zip.files).filter(n=>/^ppt\/(slides|slideLayouts|slideMasters)\/.*\.xml$/.test(n))){
 let xml=await zip.file(name)!.async('string');
 xml=xml.replace(/typeface="([^"]*)"/g,(all,f)=>`typeface="${names[f]||f}"`);
 xml=xml.replace(/<a:(rPr|defRPr|endParaRPr)\b[^>]*>[\s\S]*?<\/a:\1>/g,block=>{
  const f=block.match(/<a:latin\s+typeface="([^"]*)"\s*\/>/);if(!f)return block;
  return block.replace(/<a:ea\b[^>]*\/>|<a:cs\b[^>]*\/>/g,'').replace(f[0],`${f[0]}<a:ea typeface="${f[1]}"/><a:cs typeface="${f[1]}"/>`);
 });zip.file(name,xml);
 }
 return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
}
