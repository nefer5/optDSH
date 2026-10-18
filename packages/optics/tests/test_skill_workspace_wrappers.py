"""Skill frontend boundaries only: offline plans and fake local HTTP, never Zemax."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[3]
SKILLS=ROOT/'packages/optics/skills'
TEMP_ROOT=ROOT/'temp/optics-wrapper-tests'
TEMP_ROOT.mkdir(parents=True,exist_ok=True)
WRAPPERS={
    'rx':(SKILLS/'optdsh-rx-collection-efficiency/scripts/scan.py',SKILLS/'optdsh-rx-collection-efficiency/config/rx-scan.example.yaml'),
    'pilot':(SKILLS/'optdsh-assembly-tolerance/scripts/run_tx_pilot.py',SKILLS/'optdsh-assembly-tolerance/config/tx-pilot.example.yaml'),
    'native':(SKILLS/'optdsh-assembly-tolerance/scripts/run_tx_native.py',SKILLS/'optdsh-assembly-tolerance/config/tx-native.example.yaml'),
}


class SkillWorkspaceTests(unittest.TestCase):
    def cli(self,script,workspace,config,home,*flags):
        env=os.environ.copy();env.pop('PYTHONPATH',None)
        env.pop('OPTDSH_STATE_ROOT',None);env.pop('OPTDSH_PROFILE',None)
        return subprocess.run([sys.executable,'-I',str(script),str(config),'--home',str(home),*flags],cwd=workspace,env=env,capture_output=True,text=True,encoding='utf-8',timeout=30)

    def test_all_frontends_plan_in_two_plain_workspaces_with_installed_package(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as tmp:
            sandbox=Path(tmp);entrypoints=sandbox/'standalone entrypoints';entrypoints.mkdir()
            private_home=sandbox/'isolated home'
            for name in ('外部课题 A','外部课题 B 中文空格'):
                workspace=sandbox/name;workspace.mkdir()
                for kind,(script,template) in WRAPPERS.items():
                    copied=entrypoints/(kind+'.py');shutil.copyfile(script,copied)
                    config=workspace/(kind+'.yaml');shutil.copyfile(template,config)
                    original=config.read_bytes()
                    # Default workspace is cwd; no Study or bridge configuration exists.
                    done=self.cli(copied,workspace,config.name,private_home)
                    self.assertEqual(done.returncode,0,done.stderr+'\n'+done.stdout)
                    receipt=json.loads(done.stdout);run=Path(receipt['run'])
                    self.assertEqual(receipt['status'],'planned')
                    self.assertTrue(run.is_relative_to(workspace/'runs'))
                    manifest=json.loads((run/'manifest.json').read_text())
                    self.assertEqual(manifest['workspaceRoot'],str(workspace))
                    self.assertEqual(manifest['mode'],'plan')
                    self.assertEqual((run/'config/input.yaml').read_bytes(),original)
                    self.assertTrue((run/'report.html').is_file())
                    self.assertTrue((run/'code/entrypoint'/copied.name).is_file())
                    if kind=='native':self.assertTrue(receipt['requiresLiveValidation'])
                self.assertFalse((workspace/'STUDYS').exists())
                self.assertFalse((workspace/'.runtime').exists())
            self.assertFalse(private_home.exists())

    def test_native_rejects_wrong_workspace_before_any_fake_http_request(self):
        self.native_service_case(mismatch=True)

    def test_each_frontend_refuses_foreign_access_record_and_state_root(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as tmp:
            sandbox=Path(tmp);workspace=sandbox/'workspace';workspace.mkdir()
            state=sandbox/'private-state';(state/'.runtime').mkdir(parents=True)
            access=state/'.runtime/optics-access.json'
            for kind,(script,_) in WRAPPERS.items():
                with patch.object(sys,'argv',['fixture']):
                    spec=importlib.util.spec_from_file_location('ownership_frontend_'+kind,script)
                    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
                access.write_text(json.dumps({'workspace':str(sandbox/'other'),'stateRoot':str(state)}))
                with self.assertRaisesRegex(ValueError,'workspace mismatch'):module.access_for_workspace(state,workspace)
                access.write_text(json.dumps({'workspace':str(workspace),'stateRoot':str(sandbox/'other-state')}))
                with self.assertRaisesRegex(ValueError,'stateRoot mismatch'):module.access_for_workspace(state,workspace)

    def test_native_fake_readonly_validation_cannot_submit_placeholder_configuration(self):
        self.native_service_case(mismatch=False)

    def native_service_case(self,mismatch):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as tmp:
            sandbox=Path(tmp);workspace=sandbox/'当前研究';workspace.mkdir()
            home=sandbox/'用户资料';state=home/'state/web';(state/'.runtime').mkdir(parents=True)
            script,template=WRAPPERS['native'];config=workspace/'native.yaml';shutil.copyfile(template,config)
            requests=[]
            class FakeHandler(BaseHTTPRequestHandler):
                def log_message(self,*args):pass
                def do_GET(self):
                    requests.append(('GET',self.path))
                    data=json.dumps({'backend':'synthetic','snapshot':{'modelId':'fake different identity','revision':'fake'}}).encode()
                    self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
                def do_POST(self):
                    requests.append(('POST',self.path));self.send_response(500);self.end_headers()
            server=ThreadingHTTPServer(('127.0.0.1',0),FakeHandler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                access={'url':'http://127.0.0.1:'+str(server.server_port),'token':'fake fixture token','workspace':str(sandbox/'wrong workspace' if mismatch else workspace),'stateRoot':str(state)}
                (state/'.runtime/optics-access.json').write_text(json.dumps(access),encoding='utf-8')
                done=self.cli(script,workspace,config,home,'--dry-run')
                self.assertEqual(done.returncode,1,done.stderr)
                result=json.loads(done.stdout)
                self.assertEqual(result['status'],'failed')
                self.assertFalse(result['executionRequested'])
                if mismatch:
                    self.assertIn('workspace mismatch',result['error']);self.assertEqual(requests,[])
                else:
                    self.assertEqual(requests,[('GET','/api/snapshot')])
                    self.assertIn('OpticsError',result['error'])
            finally:server.shutdown();server.server_close();thread.join(timeout=2)

    def test_pilot_preserves_target_and_uses_shared_lease_without_real_execution(self):
        # Synthetic stub verifies frontend plumbing only; OpticStudio is never imported/called.
        from optdsh_optics.config_io import load_config
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as tmp:
            workspace=Path(tmp)/'用户课题';workspace.mkdir()
            home=Path(tmp)/'user-home';(home/'config').mkdir(parents=True)
            config=load_config(WRAPPERS['pilot'][1]);config.update(modelId='fixture-model',expectedRevision='fixture-revision')
            source=workspace/'pilot.json';source.write_text(json.dumps(config),encoding='utf-8')
            target={'family':'ansys2023plus','year':2025,'installDir':str(Path(tmp)/'fake-install')}
            bridge={'backend':'zos-api','instance':17,'expectedFile':str(workspace/'fake.ZMX'),'target':target,'python':'never-executed'}
            (home/'config/optics.json').write_text(json.dumps(bridge),encoding='utf-8')
            argv=['pilot',str(source),'--workspace',str(workspace),'--home',str(home),'--execute']
            with patch.object(sys,'argv',argv),patch.dict(os.environ,{'OPTDSH_STATE_ROOT':str(home/'state/web')}):
                spec=importlib.util.spec_from_file_location('fixture_pilot_frontend',WRAPPERS['pilot'][0]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
                with patch.object(module,'run',return_value={'status':'completed','cases':[]}) as execute,patch('optdsh_optics.runtime.instance_lock',return_value=contextlib.nullcontext()) as lease,contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(module.main(),0)
                lease.assert_called_once_with(17)
                runtime=execute.call_args.args[1]
                self.assertEqual(runtime['target'],target)
                self.assertEqual(runtime['workspaceRoot'],str(workspace))


if __name__=='__main__':unittest.main()
