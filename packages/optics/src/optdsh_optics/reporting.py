"""Offline optical reports: narrative first, curated setup, folded raw evidence."""
from pathlib import Path
from urllib.parse import quote
import html
import json
from datetime import datetime
from .object_labels import object_label


def esc(value):
    return html.escape(str(value),quote=True)


def pretty(value):
    return json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)


def label(value):
    return '未记录' if value is None else str(value)


def setup_rows(config,runtime,manifest):
    """Only promote named, meaningful fields; arbitrary config stays folded."""
    rows=[]
    model=runtime.get('expectedFile')
    rows.append(('模型文件',str(model).replace('\\','/').split('/')[-1] if model else '未记录；不能由当前模型补推'))
    rows.append(('模型与版本',f"{label(config.get('modelId'))} / {label(config.get('expectedRevision',config.get('revision')))}"))
    for key,title in [('csv','输入样本'),('snapshot','场景快照')]:
        if config.get(key):rows.append((title,config[key]))
    if manifest.get('inputSource'):rows.append(('输入来源',str(manifest['inputSource']).replace('\\','/').split('/')[-1]))
    if manifest.get('inputConfig'):rows.append(('输入配置',manifest['inputConfig']))
    sources=config.get('sources',{})
    if isinstance(sources,list):sources={'indices':sources}
    if sources.get('indices'):rows.append(('光源组',', '.join(object_label(i) for i in sources['indices'])+' · '+sources.get('motion','未记录运动约定')))
    if config.get('lenses'):rows.append(('扰动镜片',' / '.join(f"{object_label(x['index'],x)} · {x.get('expectedType','未记录类型')}" for x in config['lenses'])))
    fields={'XPosition':'X偏心','YPosition':'Y偏心','TiltAboutX':'绕X倾斜','TiltAboutY':'绕Y倾斜'}
    if config.get('perturbations'):
        rows.append(('扰动幅度','；'.join(f"{fields.get(k,k)} ±{v:g} {'deg' if k.startswith('Tilt') else 'mm'}" for k,v in config['perturbations'].items())))
    detector=config.get('detector',{})
    if detector:
        rows.append(('探测采样',f"{object_label(detector.get('index'),detector)} · {label(detector.get('xPixels'))} × {label(detector.get('yPixels'))} 像素"))
        rows.append(('角域范围',f"H {label(detector.get('xRangeDeg'))}° / V {label(detector.get('yRangeDeg'))}°"))
    trace=config.get('trace',{})
    if trace:
        rows.append(('追迹设置',f"每源 {label(trace.get('raysPerSource'))} 条 · 种子 {label(trace.get('seed'))}"))
        rows.append(('追迹选项','；'.join(f"{name} {'开' if trace[key] else '关'}" for key,name in [('split','分裂'),('scatter','散射'),('polarization','偏振')] if key in trace)))
    metric=config.get('metric',{})
    method=metric.get('method',config.get('method'))
    if method:rows.append(('指标口径',{'equal-tail':'等尾能量区间（Tx D86为7%–93%）','shortest':'最短能量区间','full-span':'全部正权重样本包络'}.get(method,method)))
    frame=metric.get('frame',config.get('frame'))
    if frame:rows.append(('评价坐标',frame))
    if config.get('compensation') is not None:rows.append(('补偿设置','已启用（是否实际完成以结果为准）' if config['compensation'].get('enabled') else '未补偿'))
    for title,value in config.get('report',{}).get('setup',{}).items():rows.append((title,value))
    return rows


def narrative(config,result):
    context=config.get('report',{});outcome=result.get('report',{})
    tx=config.get('kind')=='functional-pilot'
    background=context.get('background') or ('镜片装入镜筒后的位置和姿态误差可能改变发射光束。本任务考察Tx镜片单因素扰动与H向发散角的关系。' if tx else '本次任务的研究背景尚未记录；需补充业务问题、分析对象及开展本次检查的原因。')
    objective=context.get('objective') or ('核对未补偿响应与计算链路；本功能试跑不构成制造公差或良率验收。' if tx else '研究目标和判定标准尚未记录；不能仅凭运行完成判断业务目标达成。')
    return context,outcome,background,objective


def build_html(manifest,result,config,runtime=None,notes=(),files=(),standalone=False,raw_input=None):
    runtime=runtime or {};context,outcome,background,objective=narrative(config,result)
    title=context.get('title',f"{manifest['workflow']} · 光学分析报告")
    mode=manifest.get('mode');status=result.get('status',manifest.get('status'))
    status_label={'completed':'完成','planned':'仅计划','failed':'失败','verification-failed':'回读验证失败','running':'运行中','created':'已创建'}.get(status,status)
    try:date_label=datetime.fromisoformat(manifest['createdAt']).strftime('%Y-%m-%d %H:%M %z')
    except ValueError:date_label=manifest['createdAt']
    provenance=result.get('analysis',{}).get('provenance',config.get('provenance'))
    state='合成演示 · 非实测' if mode=='synthetic' or provenance=='synthetic' else '历史整理 · 未重新追迹' if mode=='import' else '计划 · 未执行' if status=='planned' or mode=='plan' else '离线分析 · 非宿主追迹' if mode=='offline' else f'运行状态：{status}'
    def section(number,key,title,body):return f'<section class="chapter" id="{key}"><h2><span>{number}</span>{title}</h2>{body}</section>'
    def details(title,value):return f'<details><summary>{esc(title)}</summary><pre>{esc(value)}</pre></details>'
    body=f'<header><b>optDSH / OPTICAL STUDY</b><span class="badge">{esc(state)}</span></header><div class="hero"><p class="eyebrow">研究记录 · {esc(manifest["runId"])}</p><h1>{esc(title)}</h1><p class="meta">{esc(date_label)} · {esc(manifest["workflow"])} · {esc(status_label)} <span class="muted">({esc(status)})</span></p></div>'
    body+='<nav aria-label="报告目录">'+''.join(f'<a href="#{k}">{i}　{t}</a>' for i,k,t in [('01','background','研究背景'),('02','setup','Setup'),('03','results','结果与分析'),('04','evidence','证据与后续')])+'</nav>'
    body+=section('01','background','研究背景与目标',f'<p class="lead">{esc(background)}</p><div class="objective"><b>本次要回答的问题</b><p>{esc(objective)}</p></div>')
    curated=setup_rows(config,runtime,manifest)
    if config.get('kind')=='rx-collection-efficiency':
        from .rx_scan_report import setup as rx_setup
        curated+=rx_setup(config,result)
    setup='<dl class="setup">'+''.join(f'<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>' for k,v in curated)+'</dl>'
    setup+='<p class="muted">以上为关键条件摘录；未记录字段保留未知。完整参数在下方折叠区，不能据模板补成实际运行事实。</p>'
    setup+=details('完整解析配置（展开查看）',pretty(config))
    if raw_input is not None:setup+=details('原始配置文件（保留原文）',raw_input)
    if runtime:setup+=details('运行环境记录（展开查看）',pretty(runtime))
    body+=section('02','setup','Setup · 文件、对象与关键条件',setup)
    cases=result.get('cases',[]);numeric=[c for c in cases if 'D86FullHDeg' in c]
    conclusion=outcome.get('summary') or ('当前只生成工况计划，没有追迹结果。' if status=='planned' else '本次运行未完成，已保存的部分结果不能视为完整结论。' if status not in ('completed','planned') else '结果已记录；是否满足研究目标仍需结合下列指标口径与限制判断。')
    result_body=f'<p class="lead">{esc(conclusion)}</p>'
    if result.get('error'):result_body+=f'<p class="warning">{esc(result["error"])}</p>'
    if numeric:
        base=next((c['D86FullHDeg'] for c in numeric if c.get('name')=='nominal'),None)
        result_body+='<div class="metrics">'+''.join(f'<article><span>{esc(k)}</span><strong>{esc(v)}</strong></article>' for k,v in [('名义 H-D86 全角',f'{base:.6g}°' if base is not None else '未记录'),('已记录工况',str(len(numeric))),('补偿状态','已补偿' if result.get('compensationPerformed') else '未补偿')])+'</div>'
        result_body+='<div class="table-wrap"><table><caption>各工况 H-D86 全角；Δ 相对名义工况，单位 °</caption><thead><tr><th>工况</th><th>H-D86 / °</th><th>Δ / °</th><th>耗时 / s</th></tr></thead><tbody>'
        for c in numeric:
            delta=f"{c['D86FullHDeg']-base:+.6g}" if base is not None else '—'
            result_body+=f'<tr><td>{esc(c["name"])}</td><td class="number">{c["D86FullHDeg"]:.6g}</td><td class="number">{delta}</td><td class="number">{c["elapsedSeconds"]:.2f}</td></tr>' if 'elapsedSeconds' in c else f'<tr><td>{esc(c["name"])}</td><td class="number">{c["D86FullHDeg"]:.6g}</td><td class="number">{delta}</td><td>未记录</td></tr>'
        result_body+='</tbody></table></div>'
    elif cases:result_body+=f'<p>已列出 {len(cases)} 个计划工况，尚无测量值。</p>'
    analysis=result.get('analysis',{})
    if analysis:
        values=[]
        if 'width' in analysis:values.append(('区间宽度',f"{analysis['width']:.6g} {analysis.get('unit','')}"))
        for axis in ('H','V'):
            if isinstance(analysis.get(axis),dict) and 'width' in analysis[axis]:values.append((axis+'向尺寸',f"{analysis[axis]['width']:.6g} {analysis.get('unit','')}"))
        if 'actualRectangleFraction' in analysis:values.append(('二维矩形实际能量比例',f"{analysis['actualRectangleFraction']:.2%}"))
        result_body+='<dl class="setup">'+''.join(f'<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>' for k,v in values)+'</dl>'
        if not values:result_body+='<p>本次为结构化清单或其他离线分析；完整明细见证据折叠区。</p>'
    if config.get('kind')=='rx-collection-efficiency':
        from .rx_scan_report import results_section
        result_body+=results_section(result,config)
    if config.get('kind')=='tx-native-tolerance':
        from .tx_native_report import results_section
        result_body+=results_section(result,config)
    if config.get('kind')=='tx-custom-tolerance':
        from .tx_custom_report import results_section
        result_body+=results_section(result,config)
    if outcome.get('interpretation'):result_body+=f'<h3>结果解释</h3><p>{esc(outcome["interpretation"])}</p>'
    result_body+='<div class="limitations"><h3>结论边界与检查</h3><ul>'+''.join(f'<li>{esc(n)}</li>' for n in notes)+'</ul>'
    if 'primaryUnchanged' in result:result_body+=f'<p>原模型未变：{esc(result.get("primaryUnchanged"))} · 副本关闭：{esc(result.get("copyClosed"))} · 清理异常：{esc(result.get("cleanupErrors"))}</p>'
    result_body+='</div>';body+=section('03','results','结果、解释与适用边界',result_body)
    evidence='<h3>下一步</h3><ul>'+''.join(f'<li>{esc(n)}</li>' for n in outcome.get('nextSteps',['结合本次限制确认下一步；未记录的指标口径和验收条件需先补齐。']))+'</ul>'
    if standalone:evidence+='<p class="muted">本页是合成设计样例；参数和示例结果内嵌，不关联真实模型或运行证据。</p>'
    else:
        evidence+='<p><a href="result.json">结果数据</a> · <a href="manifest.json">清单与SHA-256</a> · <a href="config/resolved.json">实际配置</a></p>'
        evidence+='<details><summary>包内输入与证据文件</summary><ul>'+''.join(f'<li><a href="{quote(name)}">{esc(name)}</a></li>' for name in files if name not in ('report.html','report.md','manifest.json'))+'</ul></details>'
    evidence+=details('完整结果数据（展开查看）',pretty(result))
    body+=section('04','evidence','证据与后续',evidence)
    body+='<footer><span>optDSH · 可追溯的光学研究记录</span><a href="#top">返回顶部 ↑</a></footer>'
    css=Path(__file__).with_name('report.css').read_text(encoding='utf-8')
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>'+css+'</style></head><body><main id="top">'+body+'</main></body></html>'


def render_report(path,manifest,result,notes=()):
    path=Path(path);config=json.loads((path/'config/resolved.json').read_text(encoding='utf-8'))
    runtime_path=path/'config/runtime.json';runtime=json.loads(runtime_path.read_text(encoding='utf-8')) if runtime_path.exists() else {}
    if manifest['report'].endswith('.md'):
        _,outcome,background,objective=narrative(config,result)
        text=f"# {manifest['workflow']} / {manifest['runId']}\n\n状态：{result.get('status',manifest['status'])}\n\n## 任务\n\n{background}\n\n{objective}\n\n## 结果\n\n{outcome.get('summary',result.get('error','详见结果数据；尚无叙述性结论。'))}\n\n## 限制\n\n"+'\n'.join('- '+n for n in notes)+'\n\n[配置](config/resolved.json) · [结果](result.json) · [证据清单](manifest.json)\n'
        (path/manifest['report']).write_text(text,encoding='utf-8');return
    files=[p.relative_to(path).as_posix() for p in sorted(path.rglob('*')) if p.is_file()]
    raw_input=(path/manifest['inputConfig']).read_text(encoding='utf-8-sig') if manifest.get('inputConfig') else None
    (path/manifest['report']).write_text(build_html(manifest,result,config,runtime,notes,files,raw_input=raw_input),encoding='utf-8')
