import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {COLUMNS,DEFAULT_SHARES,MIN_WIDTHS,columnPixels,resizeBoundary,normalizeShares} from '../web/optics/layout-state.js';
import {messageParts,renderMessage} from '../web/optics/chat-message.js';

test('PC widths retain the same Figma-derived default proportions',()=>{
 for(const width of [1253,1893,2533,3413,5093]){const px=columnPixels(DEFAULT_SHARES,width);for(const k of COLUMNS)assert.ok(Math.abs(px[k]/width-DEFAULT_SHARES[k])<1e-10);assert.ok(Math.abs(Object.values(px).reduce((a,b)=>a+b,0)-width)<1e-8);}
 assert.ok(Math.abs(DEFAULT_SHARES.scene-(792*.9/1624))<1e-10);
});
test('chat can exceed 650px and reach over half of the PC viewport',()=>{
 for(const width of [1023,1253,3413,5093]){const requested=width*(width===1023?.5:.55),resized=resizeBoundary(DEFAULT_SHARES,3,columnPixels(DEFAULT_SHARES,width).chat-requested,width),px=columnPixels(resized,width);assert.ok(Math.abs(px.chat-requested)<1e-8);for(const k of COLUMNS)assert.ok(px[k]>=MIN_WIDTHS[k]-1e-8);}
 assert.ok(columnPixels(resizeBoundary(DEFAULT_SHARES,3,columnPixels(DEFAULT_SHARES,3413).chat-1800,3413),3413).chat>650);
});
test('extreme drags conserve width and protect remaining columns',()=>{
 for(const key of ['list','properties','chat'])for(const value of [-1000,1e6]){const p=columnPixels(resizeBoundary(DEFAULT_SHARES,COLUMNS.indexOf(key),columnPixels(DEFAULT_SHARES,1253)[key]-value,1253),1253);assert.ok(Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1253)<1e-8);for(const k of COLUMNS)assert.ok(p[k]>=MIN_WIDTHS[k]-1e-8);}
 assert.deepEqual(normalizeShares({chat:NaN}),DEFAULT_SHARES);
});
test('message roles use bubble classes and accessible labels, not visible title rows',()=>{
 const {document}=parseHTML('<html><body></body></html>');
 for(const role of ['user','assistant']){const n=renderMessage({seq:1,role,text:'<img src=x onerror=alert(1)>'},document);assert.ok(n.classList.contains('from-'+role));assert.equal(n.querySelector('strong'),null);assert.equal(n.querySelector('img'),null);assert.equal(n.querySelector('.message-body').textContent,'<img src=x onerror=alert(1)>');assert.ok(n.getAttribute('aria-label'));}
});
test('new contexts and old canvas payloads fold without changing ordinary JSON',()=>{
 const {document}=parseHTML('<html><body></body></html>');
 const old={requestId:'canvas-old',text:'【画板提交 canvas-old · 版本 1】\n{"note":"看这里","elements":[{"type":"text","text":"x"}]}'};
 assert.equal(messageParts(old).text,'看这里');const n=renderMessage({...old,seq:2,role:'user'},document);assert.equal(n.querySelector('details').hasAttribute('open'),false);assert.ok(!n.querySelector('.message-body').textContent.includes('elements'));
 const scene='```json\n{"type":"excalidraw","elements":[]}\n```';assert.equal(messageParts({text:scene}).context.length,1);
 const config='```json\n{"rays":25000}\n```';assert.equal(messageParts({text:config}).text,config);
});

test('empty tool-only turns take no bubble space, useful emphasis is rendered safely',()=>{const {document}=parseHTML('<html><body></body></html>');assert.equal(renderMessage({role:'assistant',text:'',context:[]},document),null);const n=renderMessage({role:'assistant',text:'## 结论\n**重点**和`参数`'},document);assert.equal(n.querySelector('.message-heading').textContent,'结论');assert.equal(n.querySelector('code').textContent,'参数');assert.ok(!n.textContent.includes('**'));});
