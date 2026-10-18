"""Tx pilot: offline plan by default; explicit execution records a frozen run."""
import argparse
import json
from pathlib import Path
import sys

bootstrap=argparse.ArgumentParser(add_help=False)
bootstrap.add_argument('--package-source',type=Path)
bootstrap_args,_=bootstrap.parse_known_args()
if bootstrap_args.package_source:sys.path.insert(0,str(bootstrap_args.package_source.expanduser().resolve()))
from optdsh_optics.config_io import parse_config, load_config
from optdsh_optics.run_bundle import RunBundle
from optdsh_optics.runtime import add_paths, launch_paths, access_for_workspace, snapshot_code

from optdsh_optics.tx_pilot import validate, run
from optdsh_optics.run_bundle import TX_NOTES


def main():
    parser=argparse.ArgumentParser(description=__doc__);add_paths(parser)
    parser.add_argument('--execute',action='store_true')
    args=parser.parse_args()
    workspace,state,config_path,bridge_path=launch_paths(args)
    raw=config_path.read_bytes();config=parse_config(raw,config_path.suffix)
    bundle=RunBundle.create(workspace,'tx',config,root=args.runs_root,source=config_path,source_bytes=raw,mode='execute' if args.execute else 'plan')
    config=json.loads((bundle.path/'config/resolved.json').read_text(encoding='utf-8'))
    snapshot_code(bundle,__file__)
    try:
        cases=validate(config)
        if args.execute and any(config[k].startswith('REPLACE_') for k in ('modelId','expectedRevision')):
            raise ValueError('Replace template model identity/revision before execution')
        bundle.write('plan.json',{'scope':'tx','cases':cases,'executionRequested':args.execute})
        if not args.execute:
            result={'status':'planned','scope':'tx','cases':cases,'compensationPerformed':False,'executionRequested':False}
        else:
            access=access_for_workspace(state,workspace)
            runtime=load_config(bridge_path)
            bridge={k:runtime[k] for k in ('expectedFile','instance','backend','python','target') if k in runtime}
            if bridge.get('backend')!='zos-api':raise ValueError('Explicit zos-api bridge required')
            bridge.update(workspaceRoot=str(workspace),stateRoot=str(state),executorPython=sys.executable)
            bundle.write('config/runtime.json',bridge)
            bridge=json.loads((bundle.path/'config/runtime.json').read_text(encoding='utf-8'))
            if access:
                import socket
                from urllib.parse import urlsplit
                url=urlsplit(access['url'])
                if url.scheme!='http' or url.hostname!='127.0.0.1' or not url.port or url.username or url.password or url.path not in ('','/') or url.query or url.fragment:
                    raise ValueError('Invalid local optics access URL')
                with socket.socket() as probe:
                    probe.settimeout(1)
                    if probe.connect_ex(('127.0.0.1',url.port))==0:raise RuntimeError('Stop the selected optics bridge before exclusive Tx pilot execution.')
            from optdsh_optics.runtime import instance_lock
            with instance_lock(bridge['instance']):result=run(config,bridge,bundle.path)
    except Exception as exc:
        evidence=bundle.path/'result.json'
        result=json.loads(evidence.read_text(encoding='utf-8')) if evidence.exists() else {'cases':[]}
        result.update(status='failed',error=type(exc).__name__+': '+str(exc))
    bundle.finish(result['status'],result,notes=TX_NOTES)
    print(json.dumps({'status':result['status'],'run':str(bundle.path),'report':str(bundle.path/'report.html')},ensure_ascii=False))
    return 0 if result['status'] in ('planned','completed') else 1


if __name__=='__main__':sys.exit(main())
