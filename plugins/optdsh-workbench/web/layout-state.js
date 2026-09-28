// Figma 31:104: 792 / 166 / 236 / 430; move 10% of the 3D width to chat.
export const COLUMNS=['scene','list','properties','chat'];
export const DEFAULT_SHARES=Object.freeze({scene:712.8/1624,list:166/1624,properties:236/1624,chat:509.2/1624});
export const MIN_WIDTHS=Object.freeze({scene:220,list:105,properties:140,chat:260});
export function normalizeShares(value){
 if(!value||COLUMNS.some(k=>typeof value[k]!=='number'||!Number.isFinite(value[k])||value[k]<=0))return {...DEFAULT_SHARES};
 const total=COLUMNS.reduce((n,k)=>n+value[k],0);return Object.fromEntries(COLUMNS.map(k=>[k,value[k]/total]));
}
function allocate(keys,weights,width,minima){
 const minimum=keys.reduce((n,k)=>n+minima[k],0);
 if(width<minimum)return Object.fromEntries(keys.map(k=>[k,width*minima[k]/minimum]));
 const result={},free=new Set(keys);let remaining=width;
 while(free.size){const sum=[...free].reduce((n,k)=>n+weights[k],0);const small=[...free].filter(k=>remaining*weights[k]/sum<minima[k]);
  if(!small.length){for(const k of free)result[k]=remaining*weights[k]/sum;break;}
  for(const k of small){result[k]=minima[k];remaining-=minima[k];free.delete(k);}
 }return result;
}
export function columnPixels(shares,width){return allocate(COLUMNS,normalizeShares(shares),Math.max(1,width),MIN_WIDTHS);}
// Boundary movement, not panel-centred scaling. Adjacent donors yield first;
// only a minimum-size constraint propagates movement to the next donor.
// Interaction reference: VS Code SplitView (see docs/workbench.md).
export function resizeBoundary(shares,boundary,delta,width){
 if(!Number.isInteger(boundary)||boundary<1||boundary>=COLUMNS.length||!Number.isFinite(delta)||!Number.isFinite(width)||width<=0)throw new Error('Invalid boundary resize');
 const pixels=columnPixels(shares,width),grow=COLUMNS[delta<0?boundary:boundary-1];
 const donors=delta<0?COLUMNS.slice(0,boundary).reverse():COLUMNS.slice(boundary);
 const capacity=donors.reduce((sum,key)=>sum+Math.max(0,pixels[key]-MIN_WIDTHS[key]),0);
 let amount=Math.min(Math.abs(delta),capacity);pixels[grow]+=amount;
 for(const key of donors){const take=Math.min(amount,Math.max(0,pixels[key]-MIN_WIDTHS[key]));pixels[key]-=take;amount-=take;if(amount<=1e-8)break;}
 return normalizeShares(pixels);
}
export function splitPixels(percent,height,gutter=8){
 const available=Math.max(0,height-gutter),minimum=Math.min(96,available/2);
 const upper=Math.max(minimum,Math.min(available-minimum,available*(Number.isFinite(percent)?percent:50)/100));
 return {upper,lower:available-upper,percent:available?upper/available*100:50,available};
}
