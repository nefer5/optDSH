"""Explicit worker target and a shared per-user, per-instance OS lease."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import threading

from .domain import OpticsError
_guard=threading.RLock()
_held={}

def instance_lock_path(instance):
    # Independent of installation, workspace and DSH_HOME: two projects cannot
    # opt out of coordination by choosing different state directories.
    base=Path(os.environ.get('LOCALAPPDATA',Path.home()/'.local/share'))/'optDSH'/'locks'
    base.mkdir(parents=True,exist_ok=True)
    return base/f'zemax-extension-{int(instance)}.lock'

@contextmanager
def instance_lock(instance):
    path=instance_lock_path(instance)
    if path.with_suffix('.uncertain.json').exists():
        raise OpticsError('HOST_RECOVERY_REQUIRED','An earlier operation has unresolved cleanup; inspect its run and Zemax before explicit recovery')
    key=(threading.get_ident(),str(path))
    with _guard:
        if key in _held:
            _held[key][1]+=1
        else:
            stream=path.open('a+b')
            if os.fstat(stream.fileno()).st_size==0:stream.write(b'0');stream.flush()
            stream.seek(0)
            try:
                if os.name=='nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
                else:
                    import fcntl
                    fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except OSError:
                stream.close()
                raise OpticsError('HOST_BUSY','Another workspace/process owns this Zemax instance') from None
            _held[key]=[stream,1]
    try:
        if path.with_suffix('.uncertain.json').exists():
            raise OpticsError('HOST_RECOVERY_REQUIRED','Previous native cleanup requires explicit recovery')
        yield
    finally:
        with _guard:
            _held[key][1]-=1
            if not _held[key][1]:
                stream=_held.pop(key)[0];stream.seek(0)
                if os.name=='nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)
                else:
                    import fcntl
                    fcntl.flock(stream,fcntl.LOCK_UN)
                stream.close()

def mark_instance_uncertain(instance, run):
    path=instance_lock_path(instance).with_suffix('.uncertain.json')
    path.write_text(json.dumps({'instance':instance,'run':str(Path(run).resolve()),
        'status':'manual-recovery-required','reason':'native cleanup or tool completion not confirmed'}),encoding='utf-8')


def worker_environment(config):
    env=os.environ.copy()
    if config.get('target'):env['OPTDSH_ZEMAX_TARGET']=json.dumps(config['target'])
    else:env.pop('OPTDSH_ZEMAX_TARGET',None)
    return env

def validate_target(target):
    if not isinstance(target,dict) or target.get('family') not in ('zemax18','ansys2023plus'):
        raise OpticsError('TARGET_REQUIRED','Select target.family: zemax18 or ansys2023plus, and its installDir')
    if target['family']=='zemax18':
        raise OpticsError('LEGACY_BRIDGE_UNAVAILABLE','Zemax 18 requires a dedicated .NET Framework process bridge; not yet implemented or validated')
    install=Path(target.get('installDir',''))
    if not install.is_absolute() or not all((install/f).is_file() for f in ('ZOSAPI.dll','ZOSAPI_Interfaces.dll')):
        raise OpticsError('TARGET_INSTALL_INVALID','target.installDir must name the selected installation containing ZOSAPI DLLs')
    return target

def validate_host_version(version,target):
    import re
    match=re.search(r'(?<![0-9])(20[0-9]{2}|[0-9]{1,2})(?=[.\s]|$)',str(version))
    year=int(match[1]) if match else 0
    if year<100:year+=2000
    if target['family']!='ansys2023plus' or year<2023:
        raise OpticsError('TARGET_VERSION_MISMATCH','Connected host does not belong to the configured 2023+ family')
    expected=target.get('year')
    if expected is not None and year!=int(expected):
        raise OpticsError('TARGET_VERSION_MISMATCH','Connected host differs from target.year')


def add_paths(parser, *, bridge_config=True):
    """Shared CLI paths for installed optical workflow frontends."""
    parser.add_argument('config',type=Path)
    parser.add_argument('--workspace',type=Path,default=Path.cwd())
    parser.add_argument('--home',type=Path)
    parser.add_argument('--profile',default=os.environ.get('OPTDSH_PROFILE','web'))
    parser.add_argument('--state-root',type=Path)
    if bridge_config:parser.add_argument('--bridge-config',type=Path)
    parser.add_argument('--runs-root',type=Path)
    parser.add_argument('--package-source',type=Path,help='Explicit development source path; normally use installed optdsh-optics')


def launch_paths(args):
    """Return workspace, state, input and bridge config paths without creating any."""
    import re
    workspace=args.workspace.expanduser().resolve()
    if not workspace.is_dir():raise ValueError('Workspace must be an existing directory')
    home=(args.home or Path(os.environ.get('OPTDSH_HOME',Path.home()/'.optdsh'))).expanduser().resolve()
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}',args.profile):raise ValueError('Invalid profile name')
    state=(args.state_root or Path(os.environ.get('OPTDSH_STATE_ROOT',home/'state'/args.profile))).expanduser().resolve()
    source=args.config.expanduser()
    source=(source if source.is_absolute() else workspace/source).resolve()
    bridge=getattr(args,'bridge_config',None) or home/'config/optics.json'
    bridge=(bridge if bridge.is_absolute() else workspace/bridge).expanduser().resolve()
    return workspace,state,source,bridge


def access_for_workspace(state,workspace):
    """Refuse legacy/foreign records before credentials reach any HTTP client."""
    state=Path(state).resolve();workspace=Path(workspace).resolve()
    path=state/'.runtime/optics-access.json'
    if not path.exists():return None
    record=json.loads(path.read_text(encoding='utf-8'))
    if not record.get('workspace') or Path(record['workspace']).resolve()!=workspace:
        raise ValueError('Optics access workspace mismatch; refusing another research directory')
    if not record.get('stateRoot') or Path(record['stateRoot']).resolve()!=state:
        raise ValueError('Optics access stateRoot mismatch')
    return record


def snapshot_code(bundle,entrypoint):
    """Freeze installed package source and the selected frontend, never a checkout root."""
    from .run_bundle import sha
    entrypoint=Path(entrypoint).resolve()
    bundle.manifest['code']={}
    for source in [entrypoint,*sorted(Path(__file__).parent.glob('*.py'))]:
        name=('entrypoint/' if source==entrypoint else 'optdsh_optics/')+source.name
        bundle.copy(source,'code/'+name)
        bundle.manifest['code'][name]=sha(source)
