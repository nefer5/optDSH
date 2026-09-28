import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const source=path.resolve('node_modules/@textcortex/slidewise/src');
export default defineConfig({plugins:[react(),{
  name:'slidewise-local-fonts', enforce:'pre',
  transform(code,id){
    if(id.replaceAll('\\','/').endsWith('/components/editor/FloatingToolbar.tsx')){
      if(!code.includes('const FONTS = [')) throw Error('SlideWise font menu changed');
      return code.replace('const FONTS = [','const FONTS = ["黑体", "等线", "等线 Light", "微软雅黑", "微软雅黑 Light", "楷体", "仿宋",');
    }
    if(id.replaceAll('\\','/').endsWith('/lib/fonts.ts')){
      return code.replace('const candidates = families','return null; // Project policy: local fonts only.\n  const candidates = families');
    }
  }
}],resolve:{alias:{'@textcortex/slidewise/style.css':path.join(source,'SlidewiseEditor.css'),'@textcortex/slidewise':path.join(source,'index.ts'),'@':source}},build:{chunkSizeWarningLimit:1500}});
