"""Plan or copy historical Tx evidence into an explicit workspace; never execute optics."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

# Source-checkout compatibility only; this location never selects user data.
source_package=Path(__file__).resolve().parents[2]/'packages/optics/src'
if source_package.is_dir():sys.path.insert(0,str(source_package))
from optdsh_optics.run_bundle import RunBundle, TX_NOTES, sha, canonical, resolve_runs_root


def inventory(source):
    """Reject links/reparse points instead of importing files from hidden targets."""
    files=[]
    def refuse_unreadable(error):raise error
    for folder, dirs, names in os.walk(source, followlinks=False,onerror=refuse_unreadable):
        current=Path(folder)
        for name in dirs+names:
            item=current/name
            info=item.lstat()
            if item.is_symlink() or getattr(info,'st_file_attributes',0)&getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',0x400):
                raise ValueError('Input contains a link/reparse point: '+str(item.relative_to(source)))
        for name in sorted(names):
            item=current/name
            if not item.is_file():raise ValueError('Input must contain only ordinary files/directories')
            files.append({'path':item.relative_to(source).as_posix(),'bytes':item.stat().st_size,'sha256':sha(item)})
    return sorted(files,key=lambda row:row['path'])


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path,help='Existing historical result directory, read only')
    parser.add_argument('--workspace',type=Path,required=True,help='Existing user research directory; all outputs stay inside it')
    parser.add_argument('--runs-root',type=Path,help='Optional output root, relative to workspace or an absolute path inside it')
    action=parser.add_mutually_exclusive_group()
    action.add_argument('--dry-run',action='store_true',help='Validate and print the copy plan without allocating a run (default)')
    action.add_argument('--execute',action='store_true',help='Copy synthetic or explicitly selected historical evidence; never run Zemax')
    args=parser.parse_args(argv)
    try:
        workspace=canonical(args.workspace)
        source=canonical(args.source)
        if args.source.is_symlink() or getattr(args.source.lstat(),'st_file_attributes',0)&getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',0x400):
            raise ValueError('Input source itself cannot be a link/reparse point')
        if not source.is_dir():raise ValueError('Source must be an existing result directory')
        runs_root=resolve_runs_root(workspace,'tx',root=args.runs_root)
        if runs_root==source or runs_root.is_relative_to(source):
            raise ValueError('Output root cannot be inside the imported source')
        files=inventory(source)
        raw=(source/'result.json').read_bytes()
        result=json.loads(raw.decode('utf-8-sig'))
        if not isinstance(result,dict) or not isinstance(result.get('config'),dict) or not isinstance(result.get('status'),str):
            raise ValueError('Historical result.json requires config mapping and status string')
        result_hash=hashlib.sha256(raw).hexdigest()
        if next((row['sha256'] for row in files if row['path']=='result.json'),None)!=result_hash:
            raise ValueError('Historical result changed during inventory')
        plan={'mode':'execute-copy' if args.execute else 'dry-run','workspaceRoot':str(workspace),'source':str(source),'runsRoot':str(runs_root),'files':files,'executesOptics':False}
        if not args.execute:
            print(json.dumps(plan,ensure_ascii=False))
            return 0
        bundle=RunBundle.create(workspace,'tx',result['config'],root=runs_root,mode='import')
        bundle.manifest['import']={'source':str(source),'sourceResultSha256':result_hash,'configurationOrigin':'historical result.json/config','originalExecutionTime':None,'runtimeConfig':'not preserved by legacy runner','executionCodeRevision':'unknown; do not substitute current source'}
        for row in files:
            item=source/row['path']
            if sha(item)!=row['sha256']:raise ValueError('Source changed after copy planning: '+row['path'])
            bundle.copy(item,'original/'+row['path'])
            if sha(bundle.path/'original'/row['path'])!=row['sha256']:raise ValueError('Imported bytes do not match initial evidence')
        if inventory(source)!=files:raise ValueError('Source tree changed while copying')
        bundle.finish(result['status'],result,notes=('此包仅复制所选历史证据；配置从当时result.json提取，没有使用当前项目配置，也没有重新追迹。',)+TX_NOTES)
        plan.update(run=str(bundle.path),report=str(bundle.path/'report.html'),status='copied-and-verified')
        print(json.dumps(plan,ensure_ascii=False))
        return 0
    except (OSError,ValueError,KeyError,TypeError) as exc:
        parser.exit(2,'Import refused: '+str(exc)+'\n')


if __name__=='__main__':
    raise SystemExit(main())
