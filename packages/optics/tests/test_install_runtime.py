"""Deployment and process-boundary checks; never connect to Zemax."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'src'))
from optdsh_optics.domain import OpticsError
from optdsh_optics.runtime import instance_lock, instance_lock_path, validate_target, validate_host_version, mark_instance_uncertain
from optdsh_optics.service import Bridge


class InstalledRuntimeTests(unittest.TestCase):
    def test_state_and_workspace_separate_with_packaged_synthetic_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace=Path(tmp)/'研究 workspace';workspace.mkdir()
            state=Path(tmp)/'state'
            bridge=Bridge({'backend':'synthetic','stateRoot':str(state)},workspace)
            bridge.refresh()
            self.assertTrue(list((state/'data/optics/captures').glob('*.json')))
            self.assertFalse((workspace/'data').exists())
            self.assertEqual(bridge.snapshot['provenance'],'synthetic')

    def test_one_instance_lock_spans_two_workspaces_and_homes(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ,{'LOCALAPPDATA':tmp}):
            first=instance_lock_path(2)
            with patch.dict(os.environ,{'OPTDSH_HOME':str(Path(tmp)/'another-home'),'OPTDSH_WORKSPACE':str(Path(tmp)/'workspace-b')}):
                self.assertEqual(instance_lock_path(2),first)
            self.assertEqual(first,Path(tmp)/'optDSH/locks/zemax-extension-2.lock')
            env=os.environ.copy()
            env['PYTHONPATH']=str(Path(__file__).resolve().parents[1]/'src')
            script="from optdsh_optics.runtime import instance_lock; import sys; lease=instance_lock(2); lease.__enter__(); print('locked',flush=True); sys.stdin.readline(); lease.__exit__(None,None,None)"
            child=subprocess.Popen([sys.executable,'-c',script],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                self.assertEqual(child.stdout.readline().strip(),'locked')
                with self.assertRaises(OpticsError) as caught:
                    with instance_lock(2):pass
                self.assertEqual(caught.exception.code,'HOST_BUSY')
                # A different instance remains usable; nested connections in a
                # single operation reuse the same held lease.
                with instance_lock(3),instance_lock(3):pass
            finally:
                child.communicate('\n',timeout=5)
            self.assertEqual(child.returncode,0)
            with instance_lock(2):pass

    def test_missing_target_and_invalid_legacy_install_fail_before_loading_clr(self):
        from optdsh_optics.connection import OpticStudio
        with patch.dict(os.environ,{'OPTDSH_ZEMAX_TARGET':'null'}):
            with self.assertRaises(OpticsError) as caught:OpticStudio()
            self.assertEqual(caught.exception.code,'TARGET_REQUIRED')
        with self.assertRaises(OpticsError) as caught:validate_target({'family':'zemax18','installDir':'not consulted'})
        self.assertEqual(caught.exception.code,'TARGET_INSTALL_INVALID')

    def test_uncertain_native_cleanup_stays_blocked_after_process_lease_release(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ,{'LOCALAPPDATA':tmp}):
            with instance_lock(7):mark_instance_uncertain(7,Path(tmp)/'run')
            with self.assertRaises(OpticsError) as caught:
                with instance_lock(7):pass
            self.assertEqual(caught.exception.code,'HOST_RECOVERY_REQUIRED')

    def test_target_install_and_connected_host_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            for dll in ('ZOSAPI.dll','ZOSAPI_Interfaces.dll'):(Path(tmp)/dll).write_bytes(b'fixture')
            target=validate_target({'family':'ansys2023plus','year':2025,'installDir':tmp})
            for version in ('25.1.0','2025.1','2025 R1'):validate_host_version(version,target)
            for version in ('18.9','19.0','22.3','24.1','unrecognized'):
                with self.assertRaises(OpticsError) as caught:validate_host_version(version,target)
                self.assertEqual(caught.exception.code,'TARGET_VERSION_MISMATCH')

    def test_worker_uses_installed_module_and_explicit_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            target={'family':'ansys2023plus','year':2024,'installDir':str(Path(tmp)/'selected')}
            config={'backend':'zos-api','instance':3,'python':sys.executable,'target':target,'expectedFile':str(Path(tmp)/'model.ZMX')}
            bridge=Bridge(config,Path(tmp))
            reply=type('Reply',(),{'returncode':0,'stdout':json.dumps({'ok':True,'raw':{'proof':'fixture'}})})()
            with patch('optdsh_optics.service.subprocess.run',return_value=reply) as worker:
                self.assertEqual(bridge._worker(config),{'proof':'fixture'})
            argv=worker.call_args.args[0]
            self.assertEqual(argv[3:6],['-m','optdsh_optics','worker'])
            self.assertNotIn('packages/optics/scripts',' '.join(argv))
            self.assertEqual(json.loads(worker.call_args.kwargs['env']['OPTDSH_ZEMAX_TARGET']),target)
            self.assertEqual(worker.call_args.kwargs['cwd'],Path(tmp))


if __name__=='__main__':unittest.main()
