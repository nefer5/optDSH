"""Project-wide immutable input snapshots, short run allocation and offline reports."""
from datetime import datetime
from pathlib import Path
import hashlib
import html
import json
import re
import shutil
import warnings


def canonical(path):
    # Windows may add the extended-path prefix while another thread creates parents.
    value=str(Path(path).resolve())
    if value.startswith('\\\\?\\UNC\\'):value='\\\\'+value[8:]
    elif value.startswith('\\\\?\\'):value=value[4:]
    return Path(value)


def stamp():
    return datetime.now().astimezone().isoformat(timespec='seconds')


def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def checked(path, root):
    path=canonical(path);rel=path.relative_to(canonical(root)).as_posix()
    units=len(rel.encode('utf-16-le'))//2
    if units>220:raise ValueError('Run path exceeds 220 UTF-16 units: '+rel)
    if units>180:warnings.warn('Run path exceeds 180 UTF-16 units: '+rel)
    return path


def write_json(path, data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
    pending=path.with_suffix(path.suffix+'.tmp');pending.write_text(raw,encoding='utf-8');pending.replace(path)


class RunBundle:
    def __init__(self, path, repo, manifest):
        self.path=canonical(path);self.repo=canonical(repo);self.manifest=manifest

    @classmethod
    def create(cls, repo, workflow, config, *, root=None, source=None, source_bytes=None, runtime=None, mode='plan', now=None):
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}',workflow):raise ValueError('Invalid workflow slug')
        # Validate JSON before allocating a directory. Callers must omit credentials.
        json.dumps(config,allow_nan=False)
        repo=canonical(repo);root=checked(root or repo/'runs'/workflow,repo)
        day=(now or datetime.now().astimezone()).strftime('%y%m%d')
        for n in range(1,10000):
            path=checked(root/f'{day}-{n:02d}',repo)
            checked(path/'config/resolved.json',repo)
            try:path.mkdir(parents=True,exist_ok=False);break
            except FileExistsError:continue
        else:raise RuntimeError('Run sequence exhausted')
        manifest={'schemaVersion':1,'runId':path.name,'workflow':workflow,'mode':mode,'status':'created','createdAt':stamp(),'config':'config/resolved.json','report':'report.html'}
        bundle=cls(path,repo,manifest)
        bundle.write('config/resolved.json',config)
        if source is not None:
            suffix=Path(source).suffix.lower()
            if suffix not in ('.json','.yaml','.yml'):raise ValueError('Unsupported input configuration format')
            relative='config/input'+suffix
            if source_bytes is None:bundle.copy(source,relative)
            else:
                target=bundle.target(relative);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source_bytes)
            manifest['inputConfig']=relative
            manifest['configSource']=str(Path(source).resolve())
        if runtime is not None:bundle.write('config/runtime.json',runtime)
        bundle.write('manifest.json',manifest)
        return bundle

    def target(self, relative):
        target=checked(self.path/relative,self.repo);target.relative_to(self.path)
        return target

    def write(self, relative, data):
        write_json(self.target(relative),data)

    def copy(self, source, relative):
        target=self.target(relative);target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():raise FileExistsError(target)
        shutil.copy2(source,target)
        if sha(source)!=sha(target):raise RuntimeError('Copied input checksum mismatch')

    def finish(self, status, result, *, notes=()):
        self.write('result.json',result)
        render_report(self.path,self.manifest,result,notes)
        self.manifest.update(status=status,finishedAt=stamp(),files={})
        for p in sorted(self.path.rglob('*')):
            if p.is_file() and p.name!='manifest.json':
                checked(p,self.repo)
                self.manifest['files'][p.relative_to(self.path).as_posix()]={'bytes':p.stat().st_size,'sha256':sha(p)}
        self.write('manifest.json',self.manifest)


def render_report(path, manifest, result, notes=()):
    """No network, external assets or JavaScript required; escape all data."""
    esc=lambda v:html.escape(str(v),quote=True)
    cases=result.get('cases',[]);numeric=[c for c in cases if 'D86FullHDeg' in c]
    config=json.loads((path/'config/resolved.json').read_text(encoding='utf-8'))
    imported=manifest.get('mode')=='import'
    title=manifest['workflow']+' / '+manifest['runId']
    status=result.get('status',manifest['status'])
    body=f'<p class="eyebrow">optDSH · RUN REPORT</p><h1>{esc(title)}</h1><p>{esc(manifest["createdAt"])} · {"历史结果整理，未重新仿真" if imported else esc(manifest["mode"])}</p>'
    body+=f'<div class="banner">状态：{esc(status)} · 配置与数据已随包保存</div>'
    if result.get('error'):body+='<p>'+esc(result['error'])+'</p>'
    if 'analysis' in result:
        body+='<h2>离线分析结果</h2><pre>'+esc(json.dumps(result['analysis'],ensure_ascii=False,indent=2))+'</pre>'
    if numeric:
        base=numeric[0]['D86FullHDeg'];maximum=max(abs(c['D86FullHDeg']-base) for c in numeric)
        body+=f'<div class="cards"><article>名义 H-D86 全角<strong>{base:.6f}°</strong></article><article>最大绝对变化<strong>{maximum:.6f}°</strong></article><article>已记录工况<strong>{len(numeric)}</strong></article></div>'
        body+='<h2>工况结果</h2><p>柱条表示相对首个名义工况的绝对变化；数值、采样限制与下方证据一起解读。</p><div class="scroll"><table><thead><tr><th>工况</th><th>H-D86 / °</th><th>变化 / °</th><th>变化幅度</th><th>耗时 / s</th></tr></thead><tbody>'
        for c in numeric:
            delta=c['D86FullHDeg']-base;width=100*abs(delta)/maximum if maximum else 0
            body+=f'<tr><td>{esc(c["name"])}</td><td>{c["D86FullHDeg"]:.6f}</td><td>{delta:+.6f}</td><td><span class="bar" style="width:{width:.1f}%"></span></td><td>{c.get("elapsedSeconds",0):.2f}</td></tr>'
        body+='</tbody></table></div>'
    body+='<h2>结论边界与检查</h2><ul>'+''.join('<li>'+esc(n)+'</li>' for n in notes)+'</ul>'
    if 'primaryUnchanged' in result:
        body+='<p>'+esc(f"原模型未变：{result.get('primaryUnchanged')}；副本关闭：{result.get('copyClosed')}；清理异常：{result.get('cleanupErrors')}")+'</p>'
    body+='<h2>本次实际配置</h2><pre>'+esc(json.dumps(config,ensure_ascii=False,indent=2))+'</pre>'
    body+='<h2>证据文件</h2><p><a href="config/resolved.json">实际配置</a> · <a href="result.json">完整结果</a> · <a href="manifest.json">清单与 SHA-256</a></p>'
    from urllib.parse import quote
    body+='<details><summary>包内数据与输入文件</summary><ul>'
    for file in sorted(path.rglob('*')):
        if file.is_file() and file.name not in ('report.html','manifest.json'):
            relative=file.relative_to(path).as_posix()
            body+=f'<li><a href="{quote(relative)}">{esc(relative)}</a></li>'
    body+='</ul></details>'
    body+='<details><summary>展开完整结果</summary><pre>'+esc(json.dumps(result,ensure_ascii=False,indent=2))+'</pre></details>'
    css='''body{margin:0;background:#f3f5f8;color:#233142;font:16px/1.6 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1100px;margin:36px auto;padding:32px;background:white;border-radius:14px}h1{font-size:30px;margin:0}h2{font-size:21px;margin-top:32px}.eyebrow{color:#147c81;letter-spacing:2px}.banner{padding:12px 16px;background:#e7f1f2;border-left:4px solid #147c81}.cards{display:flex;gap:16px;margin:22px 0}.cards article{flex:1;background:#f4f7fa;padding:16px;border-radius:8px}.cards strong{display:block;font-size:25px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:9px;border-bottom:1px solid #dce3eb;white-space:nowrap}th{background:#eef3f7}td:nth-child(4){width:140px}.bar{display:block;background:#27999e;height:9px;min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7fa;padding:16px;font:13px/1.6 Consolas,monospace}a{color:#096c9b}summary{cursor:pointer}@media(max-width:700px){main{margin:8px;padding:16px}.cards{flex-direction:column}h1{font-size:24px}}@media print{main{margin:0;padding:0}.scroll{overflow:visible}details{display:none}}'''
    (path/'report.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>'+css+'</style><main>'+body+'</main></html>',encoding='utf-8')


TX_NOTES=(
    '未补偿的功能测试，不是制造公差或良率结论；未执行四die整体6D优化。',
    'H-D86采用配置指定的能量区间及角坐标口径，正式验收定义仍需专家确认。',
    '小于或接近一个角域像素的变化不能可靠排名；固定种子重复不证明随机采样收敛。',
    '角域边界无能量不证明物理探测面未截光；需进行口径、像素和光线数收敛对照。')
