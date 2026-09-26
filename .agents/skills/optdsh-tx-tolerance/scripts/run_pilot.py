"""Tx-only pilot; every invocation records a short, self-contained run bundle."""
import argparse
import json
from pathlib import Path
import sys
import socket
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT/'src'))
from optdsh_optics.tx_pilot import validate,run
from optdsh_optics.run_bundle import RunBundle,TX_NOTES,sha
from optdsh_optics.config_io import parse_config


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('config',type=Path)
    parser.add_argument('--bridge-config',type=Path,default=ROOT/'config/optics.local.json')
    parser.add_argument('--runs-root',type=Path,default=ROOT/'runs/tx')
    parser.add_argument('--execute',action='store_true')
    args=parser.parse_args()
    raw=args.config.read_bytes();config=parse_config(raw,args.config.suffix)
    bundle=RunBundle.create(ROOT,'tx',config,root=args.runs_root,source=args.config,source_bytes=raw,mode='execute' if args.execute else 'plan')
    # Consume the persisted resolved snapshot, never reread mutable project config.
    config=json.loads((bundle.path/'config/resolved.json').read_text(encoding='utf-8'))
    bundle.manifest['code']={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in [Path(__file__),ROOT/'src/optdsh_optics/tx_pilot.py',ROOT/'src/optdsh_optics/tolerance_baseline.py',ROOT/'src/optdsh_optics/run_bundle.py',ROOT/'src/optdsh_optics/config_io.py']}
    result={}
    try:
        cases=validate(config)
        if args.execute and any(config[k].startswith('REPLACE_') for k in ('modelId','expectedRevision')):raise ValueError('Replace template model identity/revision before execution')
        bundle.write('plan.json',{'scope':'tx','cases':cases,'executionRequested':args.execute})
        if not args.execute:
            result={'status':'planned','scope':'tx','cases':cases,'compensationPerformed':False,'executionRequested':False}
        else:
            bridge=json.loads(args.bridge_config.read_text(encoding='utf-8'))
            runtime={k:bridge[k] for k in ('sourceRoot','expectedFile','instance','backend','python') if k in bridge}
            bundle.write('config/runtime.json',runtime)
            bridge=json.loads((bundle.path/'config/runtime.json').read_text(encoding='utf-8'))
            access=ROOT/'.runtime/optics-access.json'
            from urllib.parse import urlsplit
            port=urlsplit(json.loads(access.read_text(encoding='utf-8'))['url']).port if access.exists() else 3081
            with socket.socket() as probe:
                probe.settimeout(1)
                if probe.connect_ex(('127.0.0.1',port))==0:raise RuntimeError('Stop the optics bridge before exclusive Tx pilot execution.')
            import msvcrt
            (ROOT/'.runtime').mkdir(exist_ok=True)
            with (ROOT/'.runtime/tx-pilot.lock').open('a+b') as lock:
                lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
                msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
                try:result=run(config,bridge,bundle.path)
                finally:lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1)
    except Exception as e:
        evidence=bundle.path/'result.json'
        result=json.loads(evidence.read_text(encoding='utf-8')) if evidence.exists() else {'cases':[]}
        result.update(status='failed',error=type(e).__name__+': '+str(e))
    bundle.finish(result['status'],result,notes=TX_NOTES)
    print(json.dumps({'status':result['status'],'run':str(bundle.path),'report':str(bundle.path/'report.html')},ensure_ascii=False))
    return 0 if result['status'] in ('planned','completed') else 1


if __name__=='__main__':sys.exit(main())
