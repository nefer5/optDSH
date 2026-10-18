from pathlib import Path
import html,json,re,os

REPO=Path(__file__).resolve().parents[2]
OUT=REPO/'docs/refactor/2026-10-18'
PLAN=REPO/'.agents/plans/261018-platform-plugin-refactor.md'

def inline(value,origin):
    value=html.escape(value)
    def link(m):
        label,url=m.groups()
        if not re.match(r'^[a-z]+:|^#',url):
            parts=url.split('#',1);target=(origin.parent/parts[0]).resolve()
            url=Path(os.path.relpath(target,OUT)).as_posix()+('#'+parts[1] if len(parts)>1 else '')
        return f'<a href="{url}">{label}</a>'
    value=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,value)
    value=re.sub(r'`([^`]+)`',r'<code>\1</code>',value)
    return re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',value)

def markdown(path):
    lines=path.read_text(encoding='utf-8').splitlines();out=[];i=0;listing=False
    while i<len(lines):
        line=lines[i]
        if line.startswith('```'):
            if listing:out.append('</ul>');listing=False
            lang=line[3:];block=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):block.append(lines[i]);i+=1
            out.append(f'<div class="code-label">{html.escape(lang or "text")}</div><pre>{html.escape(chr(10).join(block))}</pre>')
        elif line.startswith('|') and i+1<len(lines) and re.match(r'^\|\s*:?-',lines[i+1]):
            if listing:out.append('</ul>');listing=False
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                if not re.match(r'^\|\s*:?-',lines[i]):rows.append([x.strip() for x in lines[i].strip('|').split('|')])
                i+=1
            out.append('<div class="table-wrap"><table>')
            for ri,row in enumerate(rows):out.append('<tr>'+''.join(f'<{"th" if ri==0 else "td"}>{inline(c,path)}</{"th" if ri==0 else "td"}>' for c in row)+'</tr>')
            out.append('</table></div>');continue
        elif re.match(r'^#{1,6} ',line):
            if listing:out.append('</ul>');listing=False
            n=len(line)-len(line.lstrip('#'));out.append(f'<h{min(n+1,6)}>{inline(line[n+1:],path)}</h{min(n+1,6)}>')
        elif re.match(r'^\s*[-*] ',line):
            if not listing:out.append('<ul>');listing=True
            out.append('<li>'+inline(re.sub(r'^\s*[-*] ','',line),path)+'</li>')
        elif line.strip():
            if listing:out.append('</ul>');listing=False
            out.append('<p>'+inline(line.lstrip('> '),path)+'</p>')
        elif listing:out.append('</ul>');listing=False
        i+=1
    if listing:out.append('</ul>')
    return '\n'.join(out)

def tree(block):
    roots=[];stack=[]
    for line in block.splitlines():
        if not line.strip(' │'):continue
        match=re.search('[├└]─',line)
        depth=match.start()//3+1 if match else 0
        text=line[match.end():].strip() if match else line.strip()
        parts=re.split(r'\s{2,}',text,maxsplit=1)
        node={'name':parts[0],'note':parts[1] if len(parts)>1 else '', 'children':[]}
        while stack and stack[-1][0]>=depth:stack.pop()
        (stack[-1][1]['children'] if stack else roots).append(node);stack.append((depth,node))
    def render(nodes):
        result='<ul class="tree">'
        for n in nodes:
            value=f'<span class="tree-name">{html.escape(n["name"])}</span><span class="tree-note">{html.escape(n["note"])}</span>'
            result+=('<li><details open><summary>'+value+'</summary>'+render(n['children'])+'</details></li>') if n['children'] else '<li class="leaf">'+value+'</li>'
        return result+'</ul>'
    return render(roots)

directory=(OUT/'directories.md').read_text(encoding='utf-8')
blocks=re.findall(r'```text\n(.*?)\n```',directory,re.S)
assert len(blocks)>=3,len(blocks)
blocks=blocks[:3]
catalog={
 'architecture':{'label':'架构总览','description':'看模块怎样协作、哪些是独立可选能力。','current':'architecture-current','target':'architecture-target','notes':['现状使用官方 DSH；问题在根目录绑定与独立发布边界。','目标保留官方 loop，新增包级装配而非另一套聊天系统。']},
 'installation':{'label':'安装流程','description':'看新电脑从前置条件到回执，以及失败应如何处理。','current':'install-current','target':'install-target','notes':['现有 setup 装根依赖，不重建市场插件组合。','目标按所选功能装依赖；干净环境验收尚未实施。']},
 'canvas':{'label':'画板提交','description':'看保存、显式提交、校验、投递和不确定结果。','current':'canvas-current','target':'canvas-target','notes':['保存草稿不会自动发送；queued 不等于用户应用建议。','目标 Canvas 管通用文档，DSH 薄桥管宿主绑定与投递回执。']},
 'data':{'label':'数据归属','description':'看谁真正读写数据，以及哪些地方是唯一事实源。','current':'data-current','target':'data-target','notes':['当前 BoardStore 在 DSH 插件；N05 只提供内嵌编辑器。','目标拆分官方会话、Canvas文档和研究结果，避免双写权威。']},
 'source':{'label':'源码组织','description':'看架构模块对应哪个包、哪些目录及依赖。'},
 'layout':{'label':'安装与数据','description':'看程序、用户资料、课题和实例状态各自放哪里。'},
 'sandbox':{'label':'沙箱部署验证','description':'用干净Windows先发现安装缺口，再分层验证升级与公司环境。','notes':['本机Sandbox已只读核对为Disabled；本轮没有启用或安装。','测试真实发布包，不借用开发机依赖、home或已运行服务。']},
 'design':{'label':'设计与计划','description':'阅读目标设计、待确认项与尚未开始的实施任务。'},
 'discussion':{'label':'讨论沉淀','description':'保留需求、术语澄清、取舍与验证边界，供后续接续。'}
}
module={
 'workbench':{'label':'光学工作台','current':['plugins/optdsh-workbench/','视图、官方会话接入、光学代理；静态依赖 Canvas transport。','仓库源码挂载，cwd 限制为项目根。'],'target':['plugins/optdsh-workbench/ → 独立插件包','仅负责呈现与光学适配；Canvas / Forms 为可选集成。','不安装画板也可加载；实际安装组合需验证。']},
 'canvas':{'label':'画板桥接','current':['plugins/optdsh-agent-canvas/','同时拥有 BoardStore、通用建议与宿主桥接。','文档在 data/canvas/boards，编辑器来自 N05。'],'target':['plugins/optdsh-agent-canvas/ → 独立薄桥包','认证、会话绑定、工具/消息适配和投递回执。','通用文档归独立 Canvas；具体存放路径待确认。']},
 'optics':{'label':'光学执行器','current':['packages/optics/','公共光学代码内聚，入口/worker 仍认识仓库布局。','项目 Python；部分研究配置路径固定。'],'target':['packages/optics/ → 可安装执行器','服务/worker/CLI 随包；显式 workspace 与实例配置。','跨课题共享实例锁；19/2025 各进程适配。']},
 'bundle':{'label':'Bundle / Profile','current':['node_modules/@deepseek-ai/dsh-base 等','官方 Bundle 已使用；web Profile 位于 data/dsh。','自有功能由额外源码 patch 注入。'],'target':['packages/optdsh-bundle/ → profile 依赖','包内声明 dsh.bundle.patch；Profile 选择组合。','包名、源码仓库拆分及安装器分发方式待确认。']},
 'forms':{'label':'表单与专家','current':['plugins/optdsh-forms/、optdsh-experts/','Study 路径和个人中心生成资源仍与仓库相关。','PPT 另有独立模块与安装链。'],'target':['各自可发布包与公共资源','消费当前研究目录；公共资源不依赖私人 Junction。','私人偏好、凭据与商业模型不进入公共包。']}
}
plan=markdown(PLAN)
sections={
 'source-current':tree(blocks[0]),'source-target':tree(blocks[1]),'layout-current':tree(blocks[0]),'layout-target':tree(blocks[2]),
 'design':markdown(OUT/'design.md'),'decisions':markdown(OUT/'decisions.md'),'plan':plan,'discussion':markdown(OUT/'discussion.md'),'sandbox':markdown(OUT/'windows-validation.md'),'c4':markdown(OUT/'c4-perspective.md'),'implementation':markdown(OUT/'implementation.md'),'directories':markdown(OUT/'directories.md'),'worktree':markdown(OUT/'worktree-transition.md')
}
css='''
:root{color-scheme:light;--bg:#f3f5f8;--paper:#fff;--ink:#17243a;--muted:#58687f;--line:#dce3ec;--blue:#1958a8;--amber:#835518}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "Segoe UI","Microsoft YaHei",sans-serif}button,a{touch-action:manipulation}button{font:inherit;cursor:pointer}a{color:var(--blue);text-underline-offset:3px}.shell{max-width:1660px;margin:auto;padding:30px 36px 50px}.eyebrow{font-size:12px;letter-spacing:2px;color:var(--blue);font-weight:700}h1{font-size:32px;line-height:1.35;margin:8px 0 9px}h2{font-size:23px;margin:0 0 7px}h3{font-size:19px}.lead{color:var(--muted);max-width:940px;margin:0}.top{display:flex;justify-content:space-between;gap:30px;align-items:start}.badge{font-size:13px;border:1px solid #d5bc8a;color:var(--amber);background:#fff7e8;border-radius:30px;padding:7px 15px;white-space:nowrap}.nav{display:flex;flex-wrap:wrap;gap:7px;margin:25px 0 18px;padding-bottom:18px;border-bottom:1px solid var(--line)}.nav button,.subnav button{border:1px solid transparent;background:transparent;color:var(--muted);border-radius:7px;padding:8px 14px}.nav button.active,.subnav button.active{color:var(--blue);background:#e8f0fb;border-color:#c3d6ef;font-weight:600}.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:17px;gap:25px}.switch{padding:4px;border:1px solid var(--line);border-radius:9px;background:white;display:flex;gap:4px}.switch button{border:0;border-radius:6px;padding:7px 18px;background:transparent;color:var(--muted)}.switch button[aria-pressed="true"]{background:#183b64;color:white}.switch button[data-mode="target"][aria-pressed="true"]{background:#815322}.mode-label{font-size:12px;font-weight:600;color:var(--blue)}.content{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:20px;align-items:start}.main,.side{min-width:0}.panel,.side section{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:22px}.side section{margin-bottom:15px;padding:19px}.side h3{font-size:15px;margin:0 0 8px}.side p,.side li{font-size:13px;color:var(--muted)}.side ul{padding-left:19px}.frame-wrap{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}iframe{display:block;width:100%;height:1050px;border:0}.chart-actions{display:flex;justify-content:space-between;gap:15px;padding:10px 16px;background:white;font-size:13px;border-bottom:1px solid var(--line)}.small{font-size:13px;color:var(--muted)}.module-buttons{display:flex;flex-wrap:wrap;gap:6px;margin:13px 0}.module-buttons button{padding:6px 11px;border:1px solid var(--line);border-radius:6px;background:#f6f8fb}.module-buttons button.active{background:#e8f0fb;border-color:#8dadcf}.module-info{padding:16px 19px;background:#eff5fb;border-left:3px solid var(--blue);margin-bottom:18px}.module-info p{margin:5px 0}.tree{list-style:none;padding-left:23px;border-left:1px solid #dbe3ed;margin:5px 0}.tree:first-child{padding-left:0;border:0}.tree li{padding:3px 0}.tree summary{cursor:pointer;padding:3px}.tree-name{font:14px/1.75 Consolas,"Microsoft YaHei",monospace;color:#1d446d}.tree-note{color:var(--muted);font-size:12px;margin-left:15px}.leaf{padding-left:19px!important}.zones{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px}.zone{padding:15px;background:#f8fafc;border:1px solid var(--line);border-radius:7px}.zone strong{font-size:14px}.zone p{font-size:13px;color:var(--muted);margin:5px 0}.article{font-size:15px;line-height:1.9}.article h2{font-size:25px;margin:5px 0 20px}.article h3{border-top:1px solid var(--line);padding-top:23px;margin-top:27px}.article h4{font-size:17px}.article code,pre{font-family:Consolas,"Microsoft YaHei",monospace}code{font-size:.88em;background:#edf2f8;border-radius:3px;padding:2px 4px}.article pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5f9;border:1px solid var(--line);padding:16px;font-size:13px;border-radius:6px}.code-label{font-size:12px;color:var(--muted);margin-top:15px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;border:1px solid var(--line);padding:9px}th{background:#edf3fa}.subnav{display:flex;gap:7px;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:20px}footer{margin-top:24px;border-top:1px solid var(--line);padding-top:15px;color:var(--muted);font-size:12px}.hidden{display:none!important}
'''
js='''
const $=id=>document.getElementById(id);let currentView='architecture',mode='current',moduleId='workbench',documentId='design';
function esc(v){const e=document.createElement('span');e.textContent=v;return e.innerHTML}
function render(){const item=catalog[currentView];$('view-title').textContent=item.label;$('view-desc').textContent=item.description;$('mode-label').textContent=mode==='current'?'当前情况 · 源码/文档核对':'优化目标 · 已授权 / 各项实现见计划';
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===currentView);b.setAttribute('aria-pressed',String(b.dataset.view===currentView))});
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 const chart=Boolean(item.current);$('chart').classList.toggle('hidden',!chart);$('source').classList.toggle('hidden',currentView!=='source');$('layout').classList.toggle('hidden',currentView!=='layout');$('documents').classList.toggle('hidden',!['design','discussion','sandbox'].includes(currentView));
 $('mode-switch').classList.toggle('hidden',['design','discussion','sandbox'].includes(currentView));
 if(chart){$('diagram').title=item.label+' · '+(mode==='current'?'当前情况':'优化建议');const path='diagrams/'+item[mode]+'/diagram.html';if($('diagram').getAttribute('src')!==path)$('diagram').setAttribute('src',path);$('open-diagram').href=path;$('open-json').href='diagrams/'+item[mode]+'/candidate.json'}
 if(currentView==='source'){const m=modules[moduleId];$('module-info').innerHTML='<strong>'+esc(m.label)+'</strong>'+m[mode].map(t=>'<p>'+esc(t)+'</p>').join('');$('source-tree').innerHTML=sections['source-'+mode];document.querySelectorAll('[data-module]').forEach(b=>b.classList.toggle('active',b.dataset.module===moduleId))}
 if(currentView==='layout'){$('layout-tree').innerHTML=sections['layout-'+mode];$('layout-note').textContent=mode==='current'?'当前用户数据、研究与程序位于同一N06仓库；外部N05仍需另装。':'下面是逻辑归属与目录示例；画板已确认随课题；本页目录为目标，真实资料尚未迁移。';$('zones').innerHTML=(mode==='current'?currentZones:targetZones).map(z=>'<div class="zone"><strong>'+esc(z[0])+'</strong><p>'+esc(z[1])+'</p></div>').join('')}
 if(['design','discussion','sandbox'].includes(currentView)){$('doc-nav').classList.toggle('hidden',currentView!=='design');const doc=currentView==='sandbox'?'sandbox':(currentView==='discussion'?'discussion':documentId);$('article').innerHTML=sections[doc];document.querySelectorAll('[data-document]').forEach(b=>b.classList.toggle('active',b.dataset.document===documentId))}
 if(currentView==='sandbox')$('mode-label').textContent='沙箱执行暂缓 · 以下为后续验证计划';const notes=item.notes||['三个视图解释不同问题，图形通过不代表业务验收。','研究原件、历史run和用户数据本轮没有迁移。'];$('context-notes').innerHTML=notes.map(t=>'<li>'+esc(t)+'</li>').join('');location.hash=currentView+'/'+mode;
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{currentView=b.dataset.view;render()});document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;render()});document.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>{moduleId=b.dataset.module;render()});document.querySelectorAll('[data-document]').forEach(b=>b.onclick=()=>{documentId=b.dataset.document;render()});
const parts=location.hash.slice(1).split('/');if(catalog[parts[0]])currentView=parts[0];if(['current','target'].includes(parts[1]))mode=parts[1];render();
'''
nav=''.join(f'<button data-view="{k}">{v["label"]}</button>' for k,v in catalog.items())
modules=''.join(f'<button data-module="{k}">{v["label"]}</button>' for k,v in module.items())
currentZones=[['程序安装区','N06/node_modules、.venv、plugins 与 packages 源码。'],['官方用户资料','N06/data/dsh：Profile、市场插件、官方会话。'],['研究资料','N06/STUDYS 与 runs；部分入口固定2t2r课题。'],['画板与实例状态','N06/data/canvas、data/optics、.runtime；编辑器另在N05。']]
targetZones=[['installRoot · 程序','仅版本化程序与公共资源；不向此处写研究和用户资料。'],['DSH_HOME · 官方用户资料','已确认：optDSH专用资料根，所有光学课题共用；保留官方会话和Profile格式。'],['workspace · 当前研究','课题配置、模型、专用Skills与完整run；位置任意。'],['canvasDataRoot · 通用文档','已确认随workspace/.agent-canvas；兼容桥仍在，独立文档协议待适配。'],['opticsStateRoot · 实例状态','跨课题共享实例锁、作业索引与恢复状态，不能各课题各锁各的。']]
data='const catalog='+json.dumps(catalog,ensure_ascii=False)+';const modules='+json.dumps(module,ensure_ascii=False)+';const sections='+json.dumps(sections,ensure_ascii=False).replace('</','<\\/')+';const currentZones='+json.dumps(currentZones,ensure_ascii=False)+';const targetZones='+json.dumps(targetZones,ensure_ascii=False)+';'
page=f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>optDSH · 重构设计工作簿</title><style>{css}</style></head><body><main class="shell"><header class="top"><div><div class="eyebrow">optDSH / ARCHITECTURE WORKBOOK</div><h1>把平台、插件与研究课题分开</h1><p class="lead">从运行关系到源码和安装位置，沿同一组模块理解现状与候选方案。保留讨论、设计依据和分阶段计划。</p></div><span class="badge">2026-10-18 · 设计已确认 · 分支实施中</span></header><nav class="nav" aria-label="架构视图">{nav}</nav><div class="toolbar"><div><div class="mode-label" id="mode-label"></div><h2 id="view-title"></h2><p class="lead" id="view-desc"></p></div><div class="switch" id="mode-switch" role="group" aria-label="现状与建议"><button data-mode="current" aria-pressed="true">当前情况</button><button data-mode="target" aria-pressed="false">优化建议</button></div></div><div class="content"><div class="main"><section id="chart" class="frame-wrap"><div class="chart-actions"><span>Archify 交互图 · 可缩放 / 浅深主题 / 导出</span><span><a id="open-diagram" target="_blank">独立打开</a> · <a id="open-json">图源 JSON</a></span></div><iframe id="diagram" title="当前架构图"></iframe></section><section id="source" class="panel hidden"><p class="small">点击模块查看职责对应，再展开目录。开发目录与用户实际安装目录分开理解。</p><div class="module-buttons">{modules}</div><div class="module-info" id="module-info"></div><div id="source-tree"></div></section><section id="layout" class="panel hidden"><p id="layout-note"></p><div id="zones" class="zones"></div><h3>目录组织</h3><div id="layout-tree"></div></section><section id="documents" class="panel hidden"><div class="subnav" id="doc-nav"><button data-document="worktree">开发目录迁移</button><button data-document="implementation">实施进度</button><button data-document="directories">目录原文</button><button data-document="design">目标设计</button><button data-document="decisions">决定与待定项</button><button data-document="c4">C4关注视角</button><button data-document="plan">重构计划</button></div><article id="article" class="article"></article></section></div><aside class="side"><section><h3>读图提示</h3><ul id="context-notes"></ul></section><section><h3>验证边界</h3><p>“当前”基于固定源码与现场文档；“目标”为已确认设计，部分仍待实施。图形与浏览器检查不代表新机器部署、真实模型或 Zemax 已验收。</p><p>保存草稿 ≠ 明确提交；投递成功 ≠ 仿真完成；Agent回答 ≠ 用户应用建议。</p></section><section><h3>可继续维护的文档</h3><p><a href="README.md">文档导航</a><br><a href="discussion.md">讨论记录</a><br><a href="design.md">目标设计原文</a><br><a href="decisions.md">未决事项</a><br><a href="directories.md">目录结构原文</a><br><a href="windows-validation.md">Windows沙箱方案</a><br><a href="../../../.agents/plans/261018-platform-plugin-refactor.md">L2计划原文</a><br><a href="verification.md">检查与图源回执</a></p></section></aside></div><footer>固定源码：4cb306bf4a1b200adc1b0d9d5dc3358c70c823af · 保留官方 DSH 会话循环 · 本轮已启动产品分支实施；现役资料、3080服务与沙箱未切换</footer></main><script>{data}\n{js}</script></body></html>'''
(OUT/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'output':str(OUT/'index.html'),'views':len(catalog),'diagrams':8,'directoryBlocks':len(blocks)},ensure_ascii=False))
