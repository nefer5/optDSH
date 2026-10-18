"""Offline native-Tx plan; --dry-run validates the selected service; --execute submits."""
import argparse
import json
from pathlib import Path
import sys

bootstrap=argparse.ArgumentParser(add_help=False)
bootstrap.add_argument('--package-source',type=Path)
bootstrap_args,_=bootstrap.parse_known_args()
if bootstrap_args.package_source:sys.path.insert(0,str(bootstrap_args.package_source.expanduser().resolve()))
from optdsh_optics.config_io import parse_config
from optdsh_optics.run_bundle import RunBundle
from optdsh_optics.runtime import add_paths, launch_paths, access_for_workspace, snapshot_code

import time
import uuid
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError
from optdsh_optics.tx_native import validate
from optdsh_optics.run_bundle import TX_NOTES


def main():
    parser=argparse.ArgumentParser(description=__doc__);add_paths(parser,bridge_config=False)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run',action='store_true',help='Explicit read-only validation against the selected workspace service')
    mode.add_argument('--execute',action='store_true')
    parser.add_argument('--wait',action='store_true')
    args=parser.parse_args()
    if args.wait and not args.execute:parser.error('--wait requires --execute')
    workspace,state,config_path,_=launch_paths(args)
    raw=config_path.read_bytes();config=parse_config(raw,config_path.suffix)
    bundle=RunBundle.create(workspace,'tx-native',config,root=args.runs_root,source=config_path,source_bytes=raw,
                            mode='execute' if args.execute else 'preflight' if args.dry_run else 'plan')
    config=json.loads((bundle.path/'config/resolved.json').read_text(encoding='utf-8'))
    snapshot_code(bundle,__file__)
    result={'status':'planned','executionRequested':False,'requiresLiveValidation':True}
    submitted=False
    try:
        if config.get('schemaVersion')!=1 or config.get('analysis',{}).get('mode') not in ('monte-carlo','sensitivity','custom'):
            raise ValueError('A schemaVersion=1 native/custom Tx analysis configuration is required')
        bundle.write('plan.json',{'analysis':config.get('analysis'),'executionRequested':args.execute,
                                  'requiresLiveValidation':True,'note':'Offline plan only; model identity, geometry and target objects are not validated'})
        if args.dry_run or args.execute:
            access=access_for_workspace(state,workspace)
            if access is None:raise ValueError('No optics access record in selected state root')
            url=urlsplit(access.get('url',''))
            if url.scheme!='http' or url.hostname!='127.0.0.1' or not url.port or url.username or url.password or url.path not in ('','/') or url.query or url.fragment:
                raise ValueError('Invalid loopback optics access URL')
            opener=build_opener(ProxyHandler({}))
            def request(path,data=None):
                current=access_for_workspace(state,workspace)
                if current is None or current.get('url')!=access.get('url') or current.get('token')!=access.get('token'):
                    raise ValueError('Optics service access changed; refusing automatic replay')
                req=Request(access['url'].rstrip('/')+path,data=json.dumps(data,ensure_ascii=False).encode('utf-8') if data is not None else None,
                            headers={'Authorization':'Bearer '+access['token'],'Content-Type':'application/json'})
                try:
                    with opener.open(req,timeout=35) as response:return json.load(response)
                except HTTPError as exc:raise RuntimeError(exc.read().decode('utf-8')) from None
            view=request('/api/snapshot')
            if view.get('error'):raise RuntimeError('请先在当前工作台成功刷新模型')
            if config.get('analysis',{}).get('mode')=='custom':
                from optdsh_optics.tx_custom import validate as validate_custom
                validate_custom(config,view['snapshot'])
            else:validate(config,view['snapshot'])
            result.update(status='preflight-passed',requiresLiveValidation=False)
            if args.execute:
                if view.get('backend')!='zos-api' or view['snapshot'].get('provenance')!='zos-api':
                    raise ValueError('Real execution requires an explicitly bound zos-api service')
                request_id=str(uuid.uuid4())
                bundle.manifest['requestId']=request_id;bundle.write('manifest.json',bundle.manifest)
                submitted=True
                reply=request('/api/tx-tolerance/start',{'requestId':request_id,'authorizeRun':True,'config':config,'inputYaml':raw.decode('utf-8-sig')})
                result.update(status='submitted',executionRequested=True,job=reply['job'],requestId=request_id)
                if args.wait:
                    job_id=reply['job']['id']
                    while True:
                        job=next(row for row in request('/api/tx-tolerance')['jobs'] if row['id']==job_id)
                        if job['status'] not in ('queued','running','cancelling'):
                            result.update(status=job['status'],job=job);break
                        time.sleep(1)
    except Exception as exc:
        result.update(status='uncertain' if submitted else 'failed',error=type(exc).__name__+': '+str(exc),
                      note='Inspect the existing job/request; do not automatically resubmit' if submitted else 'No optical execution was submitted')
    bundle.finish(result['status'],result,notes=TX_NOTES)
    print(json.dumps({**result,'run':str(bundle.path),'report':str(bundle.path/'report.html')},ensure_ascii=False))
    return 0 if result['status'] in ('planned','preflight-passed','submitted','completed') else 1


if __name__=='__main__':sys.exit(main())
