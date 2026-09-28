import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file())
sys.path.insert(0, str(ROOT/'packages/optics/src'))
from optdsh_optics.service import Bridge
from optdsh_optics.domain import OpticsError, make_snapshot
from optdsh_optics.capture import connection_error


class BindingTests(unittest.TestCase):
    def test_not_authorized_names_instance_without_diagnosing_license(self):
        error = connection_error(RuntimeError('当前许可证不支持 ZOS-API; LicenseStatus=NotAuthorized'), 2)
        self.assertIn('实例 2', error['message'])
        self.assertIn('Instance Number', error['message'])
        self.assertNotIn('当前许可证不支持', error['message'])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root/'optics.local.json'
        self.config = {'backend':'zos-api', 'expectedFile':str(self.root/'a.zmx'), 'instance':1,
                       'python':'test', 'sourceRoot':'test'}
        self.file.write_text(json.dumps(self.config))
        self.bridge = Bridge(self.config, self.root, self.file)
        self.old = json.loads((ROOT/'examples/bridge-demo.json').read_text())
        self.old['sourceFile'] = self.config['expectedFile']
        self.new = copy.deepcopy(self.old)
        self.new['sourceFile'] = str(self.root/'b.zmx')
        self.bridge.snapshot = make_snapshot(self.old)
        self.candidate = {'sourceFile':self.new['sourceFile'], 'instance':2, 'objectCount':3,
                          'mode':'NonSequential', 'lengthUnit':'Millimeters', 'dirty':True}

    def probe(self):
        with patch.object(self.bridge, '_worker', return_value=self.candidate):
            return self.bridge.probe(2)['candidateId']

    def test_probe_never_commits_binding_and_marks_old_model_stale(self):
        before = self.file.read_bytes()
        self.probe()
        self.assertEqual(self.file.read_bytes(), before)
        self.assertEqual(self.bridge.config, self.config)
        with self.assertRaises(OpticsError) as e:
            self.bridge.current()
        self.assertEqual(e.exception.code, 'STALE_SNAPSHOT')

    def test_confirmation_captures_expected_candidate_and_persists(self):
        token = self.probe()
        with patch.object(self.bridge, '_worker', return_value=self.new) as worker:
            result = self.bridge.switch(token)
        self.assertEqual(worker.call_args.args[0]['expectedFile'], self.new['sourceFile'])
        self.assertEqual(worker.call_args.args[0]['instance'], 2)
        saved = json.loads(self.file.read_text())
        self.assertEqual(saved, self.bridge.config)
        self.assertEqual(result['snapshot']['sourceFile'], self.new['sourceFile'])
        self.assertEqual(result['binding']['previousFile'], self.old['sourceFile'])
        self.assertTrue(result['binding']['id'])
        self.assertIsNone(result['error'])
        self.assertEqual(Bridge(saved, self.root, self.file).binding(), result['binding'])
        with self.assertRaises(OpticsError) as e:
            self.bridge.switch(token)
        self.assertEqual(e.exception.code, 'STALE_CANDIDATE')

    def test_changed_host_or_failed_capture_preserves_config_and_snapshot(self):
        token = self.probe();before = self.file.read_bytes();snapshot = self.bridge.snapshot
        for outcome in [self.old, OpticsError('HOST_UNAVAILABLE', 'disconnected')]:
            with self.subTest(outcome=type(outcome).__name__):
                with patch.object(self.bridge, '_worker', **({'side_effect':outcome} if isinstance(outcome, Exception) else {'return_value':outcome})):
                    with self.assertRaises(OpticsError):self.bridge.switch(token)
                self.assertEqual(self.file.read_bytes(), before)
                self.assertEqual(self.bridge.snapshot, snapshot)
                self.assertEqual(self.bridge.config, self.config)

    def test_expired_candidate_cannot_connect(self):
        token = self.probe();self.bridge.candidates[token]['expires'] = 0
        with patch.object(self.bridge, '_worker') as worker:
            with self.assertRaises(OpticsError) as e:self.bridge.switch(token)
            worker.assert_not_called()
        self.assertEqual(e.exception.code, 'STALE_CANDIDATE')

    def test_second_window_confirmation_invalidated_after_first_switch(self):
        first,second = self.probe(),self.probe()
        with patch.object(self.bridge, '_worker', return_value=self.new):self.bridge.switch(first)
        with self.assertRaises(OpticsError) as e:self.bridge.switch(second)
        self.assertEqual(e.exception.code, 'STALE_CANDIDATE')
        self.assertIsNone(self.bridge.view()['error'])

    def test_busy_blocks_probe_bind_refresh_and_queries(self):
        token = self.probe()
        self.bridge.capture_lock.acquire()
        try:
            for action in [lambda:self.bridge.probe(1),lambda:self.bridge.switch(token),self.bridge.refresh,self.bridge.current]:
                with self.assertRaises(OpticsError) as e:action()
                self.assertEqual(e.exception.code, 'HOST_BUSY')
        finally:self.bridge.capture_lock.release()

    def test_external_config_and_persist_failure_do_not_publish_new_model(self):
        token = self.probe();old = self.bridge.snapshot
        self.file.write_text('{}')
        with patch.object(self.bridge, '_worker', return_value=self.new):
            with self.assertRaises(OpticsError) as e:self.bridge.switch(token)
        self.assertEqual(e.exception.code, 'CONFIG_CHANGED')
        self.assertEqual(self.file.read_text(), '{}');self.assertEqual(self.bridge.snapshot, old)
        self.file.write_bytes(self.bridge.config_bytes)
        with patch.object(self.bridge, '_worker', return_value=self.new), patch('optdsh_optics.service.os.replace', side_effect=OSError('denied')):
            with self.assertRaises(OpticsError):self.bridge.switch(token)
        self.assertEqual(self.bridge.snapshot, old);self.assertEqual(json.loads(self.file.read_text()), self.config)

    def test_invalid_instance_and_missing_candidate(self):
        for value in [None, True, 0, -1, 101, 1.5, '1']:
            with self.assertRaises(OpticsError):self.bridge.probe(value)
        with self.assertRaises(OpticsError):self.bridge.switch(None)

    def test_switch_rejects_old_object_reference(self):
        old = self.bridge.snapshot;obj = old['objects'][0]
        token = self.probe()
        with patch.object(self.bridge, '_worker', return_value=self.new):self.bridge.switch(token)
        with self.assertRaises(OpticsError) as e:
            self.bridge.query('object', {'modelId':old['modelId'],'revision':old['revision'],'objectId':obj['objectId']})
        self.assertEqual(e.exception.code, 'MODEL_MISMATCH')
