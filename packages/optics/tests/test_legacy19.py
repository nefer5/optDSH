"""旧版桥的版本隔离、只读边界与返回协议；不启动真实 Zemax。"""
import json
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from optdsh_optics.domain import OpticsError
from optdsh_optics.runtime import validate_host_version, validate_target, worker_environment


class Legacy19Tests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell桥协议')
    def test_packaged_script_accepts_both_old_aliases_and_group_before_dll_loading(self):
        script = Path(__file__).parents[1]/'src/optdsh_optics/legacy.ps1'
        executable = Path(os.environ['WINDIR'])/'System32/WindowsPowerShell/v1.0/powershell.exe'
        with TemporaryDirectory() as directory:
            for family in ('zemax18','zemax19','zemaxLegacy'):
                result = subprocess.run([str(executable),'-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(script)],
                    input=json.dumps({'target':{'family':family,'installDir':directory},'instance':1}),
                    capture_output=True,text=True,encoding='utf-8',timeout=10)
                payload=json.loads(result.stdout.lstrip('\ufeff'))
                self.assertFalse(payload['ok'])
                self.assertEqual(payload['error']['code'],'HOST_UNAVAILABLE')

    def test_version_family_and_date_stamp(self):
        for version in ('190513','19.4','2019.4'):
            validate_host_version(version,{'family':'zemax19'})
        for version in ('180101','20.1','241210','2025.1'):
            with self.assertRaises(OpticsError):
                validate_host_version(version,{'family':'zemax19'})
        validate_host_version('241210',{'family':'ansys2023plus'})
        validate_host_version('180101',{'family':'zemax18'})
        with self.assertRaises(OpticsError):
            validate_host_version('190513',{'family':'zemax18'})
        with self.assertRaises(OpticsError):
            validate_host_version('190513',{'family':'ansys2023plus'})
        validate_host_version('190513',{'family':'zemaxLegacy','productMajor':19,'apiBuildYear':2019,'apiBuild':'190513'})
        validate_host_version('211210',{'family':'ansysModern','productMajor':22,'apiBuildYear':2021,'apiBuild':'211210'})
        with self.assertRaises(OpticsError):
            validate_host_version('211210',{'family':'zemaxLegacy','productMajor':21,'apiBuildYear':2021})
        with self.assertRaises(OpticsError):
            validate_host_version('211210',{'family':'zemaxLegacy','productMajor':21,'apiBuildYear':2021,'apiBuild':'210101'})
        with self.assertRaises(OpticsError):
            validate_host_version('190513',{'family':'ansysModern','productMajor':25,'apiBuildYear':2024})

    def test_explicit_target_and_worker_inheritance(self):
        with TemporaryDirectory() as directory:
            for name in ('ZOSAPI.dll','ZOSAPI_Interfaces.dll'):
                (Path(directory)/name).touch()
            target={'family':'zemax19','installDir':directory}
            self.assertEqual(validate_target(target),target)
            self.assertEqual(json.loads(worker_environment({'target':target})['OPTDSH_ZEMAX_TARGET']),target)

    def test_no_regular_connection_or_write_path_for_19(self):
        from optdsh_optics.connection import OpticStudio
        with patch('optdsh_optics.connection.validate_target',return_value={'family':'zemax19'}):
            with self.assertRaises(OpticsError) as caught:
                OpticStudio(target={'family':'zemax19'})
        self.assertEqual(caught.exception.code,'LEGACY_READ_ONLY')

    def test_capture_dispatches_only_explicit_19(self):
        from optdsh_optics.capture import _capture_unlocked
        target={'family':'zemax19','installDir':'selected-install'}
        with patch.dict('os.environ',{'OPTDSH_ZEMAX_TARGET':json.dumps(target)}), \
             patch('optdsh_optics.legacy.capture_legacy',return_value={'readOnly':True}) as bridge:
            self.assertEqual(_capture_unlocked(None,7,True),{'readOnly':True})
            bridge.assert_called_once_with(None,7,True,target)

    def test_invalid_bridge_response_is_not_success(self):
        from optdsh_optics.legacy import capture_legacy
        from types import SimpleNamespace
        with patch('optdsh_optics.legacy.validate_target',return_value={'family':'zemax19'}), \
             patch('pathlib.Path.is_file',return_value=True), \
             patch('subprocess.run',return_value=SimpleNamespace(stdout='open error',returncode=0)):
            with self.assertRaises(OpticsError) as caught:
                capture_legacy(None,0,True,{'family':'zemax19'})
        self.assertEqual(caught.exception.code,'HOST_UNAVAILABLE')


if __name__=='__main__':
    unittest.main()
