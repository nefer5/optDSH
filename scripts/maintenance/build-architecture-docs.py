"""从现行文档生成架构入口；图形由Archify生成和校验。"""
from pathlib import Path
import html,json,re,os
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/architecture'
def inline(text,origin):
    value=html.escape(text)
    def link(m):
        label,url=m.groups()
        if not re.match(r'^[a-zA-Z][\w+.-]*:|^#',url):
            name,sep,fragment=url.partition('#')
            url=Path(os.path.relpath((origin.parent/name).resolve(),OUT)).as_posix()+(sep+fragment if sep else '')
        return '<a href="'+url+'">'+label+'</a>'
    value=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,value)
    value=re.sub(r'`([^`]+)`',r'<code>\1</code>',value)
    return re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',value)
def render(path):
    lines=path.read_text(encoding='utf-8').splitlines();result=[];i=0
    while i<len(lines):
        text=lines[i]
        if text.startswith('```'):
            lang=text[3:];block=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):block.append(lines[i]);i+=1
            body='<pre>'+html.escape('\n'.join(block))+'</pre>'
            result.append('<details><summary>可编辑流程源码</summary>'+body+'</details>' if lang=='mermaid' else body)
        elif text.startswith('|') and i+1<len(lines) and re.match(r'^\|\s*:?-',lines[i+1]):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                if not re.match(r'^\|\s*:?-',lines[i]):rows.append(lines[i].strip('|').split('|'))
                i+=1
            result.append('<div class="table"><table>'+''.join('<tr>'+''.join('<'+('th' if n==0 else 'td')+'>'+inline(c.strip(),path)+'</'+('th' if n==0 else 'td')+'>' for c in row)+'</tr>' for n,row in enumerate(rows))+'</table></div>');continue
        elif re.match(r'^#{1,6} ',text):
            n=min(4,len(text)-len(text.lstrip('#'))+1);result.append(f'<h{n}>'+inline(text.lstrip('# '),path)+f'</h{n}>')
        elif text.strip():result.append('<p>'+inline(text,path)+'</p>')
        i+=1
    return '\n'.join(result)
version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
panels={'directories':render(ROOT/'docs/architecture.md'),'pending':render(ROOT/'planning/ROADMAP.md')}
views={'runtime':['运行关系','会话、插件、画板文件和光学连接的实际交互。'],'source':['源码包边界','职责对应哪些源码包；文件组织详见目录与职责。'],'layout':['安装与数据','默认路径、用户共享.agents、Skills与AGENTS发现；黄色卡片为后续计划。'],'directories':['目录与职责','默认路径与发现入口、源码资源和发布包的当前边界。'],'pending':['剩余优先级','可独立推进、需要用户配合、暂缓和正式发布决定。']}
css='''*{box-sizing:border-box}body{margin:0;background:#f2f5f9;color:#183049;font:15px/1.7 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:32px}header{display:flex;justify-content:space-between;gap:24px}h1{font-size:29px;margin:3px 0 8px}h2{font-size:23px}h3{font-size:20px}h4{font-size:17px}.eyebrow{font-size:12px;letter-spacing:2px;color:#376b9e}.muted{color:#5d7087}.badge{background:#e6eefb;border:1px solid #bfd1ec;padding:7px 14px;border-radius:30px;white-space:nowrap;height:43px}nav{display:flex;gap:8px;margin:23px 0;padding:12px 0;border-bottom:1px solid #d4deeb}button{font:inherit;padding:9px 16px;border:1px solid transparent;border-radius:8px;background:transparent;color:#546b83;cursor:pointer}button[aria-selected=true]{background:#173f6b;color:white}a{color:#1b5e9f;text-underline-offset:3px}.row{display:flex;gap:20px;align-items:flex-start}.content{min-width:0;flex:1}aside{width:240px;flex-shrink:0}.card,article{background:white;border:1px solid #d3deeb;border-radius:12px;padding:22px}.card{margin-bottom:15px;font-size:13px}.card h3{font-size:15px;margin-top:0}iframe{width:100%;height:1180px;border:1px solid #d3deeb;border-radius:12px;background:white}.bar{display:flex;gap:20px;justify-content:space-between;margin:15px 0 10px;font-size:13px}.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #d7e1ed;padding:10px 12px;text-align:left;vertical-align:top}th{background:#eaf0f9}tr:nth-child(even){background:#f8fafc}pre{background:#f0f4f9;border:1px solid #d8e1ed;border-radius:8px;padding:17px;overflow:auto;font:13px/1.8 Consolas,"Microsoft YaHei",monospace}code{background:#edf2f8;padding:1px 4px;border-radius:3px}footer{font-size:12px;color:#687b91;margin-top:25px}p{margin:9px 0}.hidden,[hidden]{display:none!important}'''
nav=''.join('<button role="tab" data-view="'+key+'">'+item[0]+'</button>' for key,item in views.items())
js='''function show(){const key=location.hash.slice(1) in views?location.hash.slice(1):'runtime';document.querySelector('#title').textContent=views[key][0];document.querySelector('#note').textContent=views[key][1];for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-selected',String(b.dataset.view===key));const diagram=!panels[key];document.querySelector('#diagram').hidden=!diagram;document.querySelector('#diagram-tools').hidden=!diagram;document.querySelector('#text').classList.toggle('hidden',diagram);if(diagram){document.querySelector('#diagram').src='diagrams/'+key+'/diagram.html';document.querySelector('#standalone').href='diagrams/'+key+'/diagram.html';document.querySelector('#candidate').href='diagrams/'+key+'/candidate.json';}else{document.querySelector('#diagram').removeAttribute('src');document.querySelector('#text').innerHTML=panels[key];}}for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{location.hash=b.dataset.view;};window.addEventListener('hashchange',show);show();'''
data='const views='+json.dumps(views,ensure_ascii=False)+';const panels='+json.dumps(panels,ensure_ascii=False).replace('</',r'<\/')+';'
page='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>optDSH · 当前架构与下一阶段</title><style>CSS</style></head><body><main><header><div><div class="eyebrow">OPTDSH / CURRENT ARCHITECTURE</div><h1>平台、插件与课题，各有归属</h1><p class="muted">当前实现三视图、文件目录与下一阶段优先级。旧方案和过程流水进入归档。</p></div><span class="badge">VERSION · 开发版</span></header><nav role="tablist" aria-label="架构视角">NAV</nav><div class="row"><section class="content"><h2 id="title"></h2><p id="note" class="muted"></p><div id="diagram-tools" class="bar"><span>Archify · 主题 / 来源 / 导出</span><span><a id="standalone" target="_blank">独立打开</a> · <a id="candidate">图源JSON</a></span></div><iframe id="diagram" title="当前架构图"></iframe><article id="text" class="hidden"></article></section><aside><div class="card"><h3>读图边界</h3><p>运行/源码图保留dev.17快照；安装与数据图已补充默认路径及发现入口。各图固定源码范围见图源JSON。</p><p>画板文档权威仍在桥内BoardStore；其他插件尚未全数收敛到Profile。</p></div><div class="card"><h3>实测与待验</h3><p>画板/工作台/Forms Profile、Forms原生侧栏回投、19与2025只读连接、Windows静默后台已有证据。</p><p>真实研究业务、其他年份、沙箱和公司环境待验。</p></div><div class="card"><h3>常用入口</h3><p><a href="../README.md">文档导航</a><br><a href="../installation/README.md">安装与升级</a><br><a href="../workbench.md">工作台使用</a><br><a href="../versioning.md">版本与GitHub</a><br><a href="../../planning/STATUS.md">当前验证状态</a><br><a href="../decisions.md">已确认决定</a><br><a href="../archive/README.md">历史归档恢复</a></p></div></aside></div><footer>Node/Python/Zemax由用户准备 · 唯一官方DSH会话 · 关闭插件不自动复活 · 商业模型与课题不进入源码仓库</footer></main><script>DATA</script></body></html>'''
page=page.replace('CSS',css).replace('VERSION',version).replace('NAV',nav).replace('DATA',data+js)
OUT.mkdir(exist_ok=True);(OUT/'index.html').write_text(page,encoding='utf-8',newline='\n')
print(json.dumps({'output':str(OUT/'index.html'),'version':version,'diagrams':3},ensure_ascii=False))
