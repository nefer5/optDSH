export const BINDING_OPTIONS = ['left','middle','right','shift+left','shift+middle','shift+right','ctrl+left','ctrl+middle','ctrl+right','alt+left','alt+middle','alt+right'];
export const DEFAULT_BINDINGS = {rotate:'left',pan:'shift+left',zoom:'middle',focus:'f'};
export function validateBindings(value) {
  if (!value || !['rotate','pan','zoom'].every(k=>BINDING_OPTIONS.includes(value[k]))) return '请选择有效的鼠标组合';
  if (new Set(['rotate','pan','zoom'].map(k=>value[k])).size!==3) return '旋转、平移和缩放不能使用相同组合';
  if (!/^[a-z0-9]$/i.test(value.focus||'')) return '聚焦键需为单个字母或数字';
  return null;
}
export function eventBinding(event) {
  const mods=[event.shiftKey?'shift':null,event.ctrlKey||event.metaKey?'ctrl':null,event.altKey?'alt':null].filter(Boolean);
  if(mods.length>1)return null;
  const button=['left','middle','right'][event.button];
  return button?`${mods.length?mods[0]+'+':''}${button}`:null;
}
export function actionFor(event,bindings,orthographic=false) {
  const key=eventBinding(event),action=['rotate','pan','zoom'].find(k=>bindings[k]===key);
  // Orthographic views preserve their axis directions: ordinary drag pans.
  return orthographic&&action==='rotate'?'pan':action||null;
}
export function editableTarget(target) {
  return !!target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]');
}
export function loadBindings(storage) {
  try { const value=JSON.parse(storage.getItem('optdsh.navigation.v1'));return validateBindings(value)?{...DEFAULT_BINDINGS}:value; }
  catch{return {...DEFAULT_BINDINGS};}
}
export function bindingLabel(value) {
  const buttons={left:'左键',middle:'中键',right:'右键'};
  return value.split('+').map(x=>buttons[x]||x[0].toUpperCase()+x.slice(1)).join(' + ');
}
