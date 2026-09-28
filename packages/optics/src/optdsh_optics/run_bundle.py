"""Project-wide immutable input snapshots, short run allocation and offline reports."""
from datetime import datetime
from pathlib import Path
import hashlib
import html
import json
import re
import shutil
import warnings
import time


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
    pending=path.with_suffix(path.suffix+'.tmp');pending.write_text(raw,encoding='utf-8')
    # Windows readers can briefly deny replace while polling status/results.
    for attempt in range(20):
        try:pending.replace(path);break
        except PermissionError:
            if attempt==19:raise
            time.sleep(.025)


class RunBundle:
    def __init__(self, path, repo, manifest):
        self.path=canonical(path);self.repo=canonical(repo);self.manifest=manifest

    @classmethod
    def create(cls, repo, workflow, config, *, root=None, source=None, source_bytes=None, runtime=None, mode='plan', now=None, complexity='complex', report_format=None):
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}',workflow):raise ValueError('Invalid workflow slug')
        if complexity not in ('simple','complex'):raise ValueError('Unknown report complexity')
        report_format=report_format or ('md' if complexity=='simple' else 'html')
        if report_format not in ('md','html') or (complexity=='complex' and report_format!='html'):raise ValueError('Complex tasks require HTML')
        # Validate JSON before allocating a directory. Callers must omit credentials.
        json.dumps(config,allow_nan=False)
        repo=canonical(repo)
        if root is None and source is not None:
            try:
                parts=canonical(source).relative_to(repo).parts
                if len(parts)>2 and parts[0]=='STUDYS':root=repo/'STUDYS'/parts[1]/'runs'/workflow
            except ValueError:pass
        root=checked(root or repo/'runs'/workflow,repo)
        day=(now or datetime.now().astimezone()).strftime('%y%m%d')
        for n in range(1,10000):
            path=checked(root/f'{day}-{n:02d}',repo)
            checked(path/'config/resolved.json',repo)
            try:path.mkdir(parents=True,exist_ok=False);break
            except FileExistsError:continue
        else:raise RuntimeError('Run sequence exhausted')
        manifest={'schemaVersion':1,'runId':path.name,'workflow':workflow,'mode':mode,'status':'created','createdAt':stamp(),'config':'config/resolved.json','report':'report.'+report_format,'complexity':complexity}
        manifest['reportRenderer']={name:sha(Path(__file__).with_name(name)) for name in ('reporting.py','report.css','object_labels.py','rx_scan_report.py')}
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
        if self.manifest['report'].endswith('.md') and len(result.get('cases',[]))>1:
            raise ValueError('Multiple conditions require an HTML report')
        self.manifest['status']=status
        self.write('result.json',result)
        render_report(self.path,self.manifest,result,notes)
        self.manifest.update(status=status,finishedAt=stamp(),files={})
        for p in sorted(self.path.rglob('*')):
            if p.is_file() and p.name!='manifest.json':
                checked(p,self.repo)
                self.manifest['files'][p.relative_to(self.path).as_posix()]={'bytes':p.stat().st_size,'sha256':sha(p)}
        self.write('manifest.json',self.manifest)


def render_report(path, manifest, result, notes=()):
    from .reporting import render_report as render
    return render(path,manifest,result,notes)


TX_NOTES=(
    '未补偿的功能测试，不是制造公差或良率结论；未执行四die整体6D优化。',
    'H-D86采用配置指定的能量区间及角坐标口径，正式验收定义仍需专家确认。',
    '小于或接近一个角域像素的变化不能可靠排名；固定种子重复不证明随机采样收敛。',
    '角域边界无能量不证明物理探测面未截光；需进行口径、像素和光线数收敛对照。')
