"""YAML frontend to the same serialized service used by the workbench."""
import argparse,json,sys,time,uuid,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
sys.path.insert(0,str(ROOT/'packages/optics/src'))
from optdsh_optics.config_io import parse_config
from optdsh_optics.tx_native import validate

def main():
    p=argparse.ArgumentParser();p.add_argument('config',type=Path);p.add_argument('--execute',action='store_true');p.add_argument('--wait',action='store_true');args=p.parse_args()
    a=json.loads((ROOT/'.runtime/optics-access.json').read_text(encoding='utf-8'))
    def request(path,data=None):
        req=urllib.request.Request(a['url']+path,data=json.dumps(data,ensure_ascii=False).encode('utf-8') if data is not None else None,headers={'Authorization':'Bearer '+a['token'],'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=35) as r:return json.load(r)
        except urllib.error.HTTPError as e:raise RuntimeError(e.read().decode('utf-8')) from None
    raw=args.config.read_bytes();c=parse_config(raw,args.config.suffix)
    view=request('/api/snapshot')
    if view.get('error'):raise RuntimeError('请先在工作台成功刷新模型')
    if c.get('analysis',{}).get('mode')=='custom':
        from optdsh_optics.tx_custom import validate as validate_custom
        validate_custom(c,view['snapshot'])
    else:validate(c,view['snapshot'])
    if not args.execute:print(json.dumps({'status':'validated','executionRequested':False},ensure_ascii=False));return
    result=request('/api/tx-tolerance/start',{'requestId':str(uuid.uuid4()),'authorizeRun':True,'config':c,'inputYaml':raw.decode('utf-8-sig')})
    print(json.dumps(result,ensure_ascii=False),flush=True)
    if args.wait:
        jid=result['job']['id']
        while True:
            j=next(x for x in request('/api/tx-tolerance')['jobs'] if x['id']==jid)
            if j['status'] not in ('queued','running','cancelling'):
                print(json.dumps(j,ensure_ascii=False));return 0 if j['status']=='completed' else 1
            time.sleep(1)

if __name__=='__main__':sys.exit(main() or 0)
