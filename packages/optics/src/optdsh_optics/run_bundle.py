"""Workspace-bounded input snapshots, short run allocation and offline reports."""
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


def resolve_runs_root(workspace, workflow, *, root=None, source=None):
    """Resolve an output location without creating it or searching installation roots.

    A supplied workspace is the boundary. Relative paths are interpreted there.
    An optional study.yaml scopes a nested study; legacy STUDYS/<name> inputs
    remain readable without making that layout a prerequisite for new projects.
    """
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}',workflow):raise ValueError('Invalid workflow slug')
    workspace=canonical(workspace)
    if not workspace.is_dir():raise ValueError('Workspace must be an existing directory')
    if root is not None:
        root=Path(root)
        return checked(root if root.is_absolute() else workspace/root,workspace)
    selected=workspace/'runs'/workflow
    if source is not None:
        source=Path(source)
        source=canonical(source if source.is_absolute() else workspace/source)
        if source.is_relative_to(workspace):
            folder=source.parent
            while folder.is_relative_to(workspace):
                if (folder/'study.yaml').is_file():
                    selected=folder/'runs'/workflow
                    break
                if folder==workspace:break
                folder=folder.parent
            else:folder=workspace
            if not (folder/'study.yaml').is_file():
                parts=source.relative_to(workspace).parts
                if len(parts)>2 and parts[0]=='STUDYS':
                    selected=workspace/parts[0]/parts[1]/'runs'/workflow
    return checked(selected,workspace)


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
        # ``repo`` is retained as an API alias; it denotes the explicit research
        # workspace, never an installation root discovered from source files.
        self.repo=canonical(repo);self.workspace=self.repo
        self.path=checked(path,self.workspace);self.manifest=manifest

    @classmethod
    def create(cls, repo, workflow, config, *, root=None, source=None, source_bytes=None, runtime=None, mode='plan', now=None, complexity='complex', report_format=None):
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}',workflow):raise ValueError('Invalid workflow slug')
        if complexity not in ('simple','complex'):raise ValueError('Unknown report complexity')
        report_format=report_format or ('md' if complexity=='simple' else 'html')
        if report_format not in ('md','html') or (complexity=='complex' and report_format!='html'):raise ValueError('Complex tasks require HTML')
        # Validate JSON before allocating a directory. Callers must omit credentials.
        json.dumps(config,allow_nan=False)
        repo=canonical(repo)
        root=resolve_runs_root(repo,workflow,root=root,source=source)
        if source is not None:
            source=Path(source)
            source=canonical(source if source.is_absolute() else repo/source)
            if source.suffix.lower() not in ('.json','.yaml','.yml'):raise ValueError('Unsupported input configuration format')
            if source_bytes is None and not source.is_file():raise ValueError('Input configuration file does not exist')
        if runtime is not None:json.dumps(runtime,allow_nan=False)
        day=(now or datetime.now().astimezone()).strftime('%y%m%d')
        for n in range(1,10000):
            path=checked(root/f'{day}-{n:02d}',repo)
            checked(path/'config/resolved.json',repo)
            try:path.mkdir(parents=True,exist_ok=False);break
            except FileExistsError:continue
        else:raise RuntimeError('Run sequence exhausted')
        manifest={'schemaVersion':1,'runId':path.name,'workflow':workflow,'mode':mode,'status':'created','createdAt':stamp(),'workspaceRoot':str(repo),'config':'config/resolved.json','report':'report.'+report_format,'complexity':complexity}
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
        target=self.target(relative)
        # The atomic-write sidecar must obey the same boundary as its final file.
        self.target(target.with_suffix(target.suffix+'.tmp').relative_to(self.path))
        write_json(target,data)

    def copy(self, source, relative):
        target=self.target(relative);target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():raise FileExistsError(target)
        shutil.copy2(source,target)
        if sha(source)!=sha(target):raise RuntimeError('Copied input checksum mismatch')

    def finish(self, status, result, *, notes=()):
        if self.manifest['report'].endswith('.md') and len(result.get('cases',[]))>1:
            raise ValueError('Multiple conditions require an HTML report')
        # Reject pre-existing junction/symlink escapes before the report writer
        # can follow them, rather than detecting them after output was written.
        for relative in (self.manifest['report'],'config/resolved.json','config/runtime.json',self.manifest.get('inputConfig')):
            if relative is not None:self.target(relative)
        for existing in self.path.rglob('*'):
            checked(existing,self.workspace).relative_to(self.path)
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
