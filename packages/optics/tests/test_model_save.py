import copy
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

ROOT = next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file())
sys.path.insert(0, str(ROOT/'packages/optics/src'))
from optdsh_optics.domain import make_snapshot, OpticsError
from optdsh_optics.model_save import save_connected, execute_save_run
from optdsh_optics.run_bundle import RunBundle
from optdsh_optics.service import Bridge


class SaveTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        self.root = Path(temp.name);self.file = self.root/'model.zmx';self.file.write_bytes(b'old disk')
        self.raw = json.loads((ROOT/'examples/bridge-demo.json').read_text())
        self.raw['sourceFile'] = str(self.file)
        self.raw['captureEvidence'] = dict(systemId='primary', dirtyBefore=True, dirtyAfter=True)
        self.system = SimpleNamespace(SystemFile=str(self.file), SystemID='primary', NeedsSave=True)
        self.calls = 0
        def save():
            self.calls += 1;self.file.write_bytes(b'current memory');self.system.NeedsSave=False
        self.system.Save = save
        self.zos = SimpleNamespace(system=self.system)
        snap = make_snapshot(self.raw)
        self.config = {'expectedFile':str(self.file),'instance':2,'systemId':'primary',
                       'modelId':snap['modelId'],'expectedRevision':snap['revision']}
        self.bundle = RunBundle.create(self.root,'model-save',self.config,mode='execute',complexity='simple')
        def read(*args):
            raw = copy.deepcopy(self.raw);raw['captureEvidence']['dirtyAfter']=self.system.NeedsSave;return raw
        p = patch('optdsh_optics.model_save.snapshot_in_connection',side_effect=read)
        self.reader = p.start();self.addCleanup(p.stop)

    def execute(self):return save_connected(self.zos, Path('unused'), self.config, self.bundle)

    def test_dirty_save_backs_up_old_disk_then_reads_current_state(self):
        raw,e = self.execute()
        self.assertEqual(self.calls,1);self.assertEqual(Path(e['backup']).read_bytes(),b'old disk')
        self.assertEqual(self.file.read_bytes(),b'current memory');self.assertFalse(raw['captureEvidence']['dirtyAfter'])
        self.assertEqual(e['status'],'saved');self.assertNotEqual(e['beforeSha256'],e['afterSha256'])

    def test_clean_model_does_not_write(self):
        self.system.NeedsSave=False
        _,e=self.execute();self.assertEqual(self.calls,0);self.assertEqual(e['status'],'already_saved')

    def test_identity_and_revision_conflicts_never_save(self):
        for key,value in [('expectedFile',str(self.root/'other.zmx')),('systemId','other'),('expectedRevision','stale')]:
            with self.subTest(key=key):
                config={**self.config,key:value}
                with self.assertRaises(OpticsError):save_connected(self.zos,Path('unused'),config,self.bundle)
        self.assertEqual(self.calls,0);self.assertEqual(self.file.read_bytes(),b'old disk')

    def test_missing_file_requires_zemax_save_as(self):
        other=self.root/'untitled.zmx';self.system.SystemFile=str(other);self.config['expectedFile']=str(other)
        with self.assertRaises(OpticsError) as e:self.execute()
        self.assertEqual(e.exception.code,'UNSAVED_MODEL');self.assertEqual(self.calls,0)

    def test_backup_failure_never_saves(self):
        with patch.object(self.bundle,'copy',side_effect=OSError('denied')):
            with self.assertRaises(OSError):self.execute()
        self.assertEqual(self.calls,0)

    def test_disk_changed_during_backup_never_saves(self):
        original=self.bundle.copy
        def changed(*args):original(*args);self.file.write_bytes(b'external')
        with patch.object(self.bundle,'copy',side_effect=changed):
            with self.assertRaises(OpticsError) as e:self.execute()
        self.assertEqual(e.exception.code,'DISK_CHANGED');self.assertEqual(self.calls,0)

    def test_false_return_or_dirty_readback_are_uncertain(self):
        for behavior in ['false','dirty','exception']:
            with self.subTest(behavior=behavior):
                self.bundle=RunBundle.create(self.root,'model-save',self.config,mode='execute',complexity='simple')
                def bad():
                    if behavior=='exception':raise RuntimeError('lost')
                    return False if behavior=='false' else None
                self.system.Save=bad
                with self.assertRaises(OpticsError) as e:self.execute()
                self.assertEqual(e.exception.code,'SAVE_UNCERTAIN')
                self.assertTrue(json.loads((self.bundle.path/'save-state.json').read_text())['saveAttempted'])

    def bridge_fixture(self):
        config={**self.config,'backend':'zos-api','python':'test','sourceRoot':'test','binding':{'id':'binding-a'}}
        bridge=Bridge(config,self.root);bridge.snapshot=make_snapshot(self.raw)
        request={'requestId':'save-'+str(uuid.uuid4()),'authorizeSave':True,'bindingId':'binding-a',
                 'modelId':self.config['modelId'],'expectedRevision':self.config['expectedRevision']}
        return bridge,request

    def test_service_requires_button_authorization_binding_and_revision(self):
        bridge,request=self.bridge_fixture()
        with patch.object(bridge,'_save_worker') as worker:
            for changes in [{'authorizeSave':False},{'bindingId':'other'},{'expectedRevision':'old'}]:
                with self.assertRaises(OpticsError):bridge.save_model({**request,**changes})
            worker.assert_not_called()

    def test_service_idempotency_survives_restart(self):
        bridge,request=self.bridge_fixture();self.raw['captureEvidence']['dirtyAfter']=False
        with patch.object(bridge,'_save_worker',return_value={'raw':self.raw,'saved':{'status':'saved'}}) as worker:
            bridge.save_model(request);r=bridge.save_model(request)
            self.assertTrue(r['replayed']);self.assertEqual(worker.call_count,1)
        restarted=Bridge(bridge.config,self.root)
        with patch.object(restarted,'_save_worker') as worker:
            self.assertTrue(restarted.save_model(request)['replayed']);worker.assert_not_called()

    def test_uncertain_result_cannot_repeat_write(self):
        bridge,request=self.bridge_fixture()
        with patch.object(bridge,'_save_worker',side_effect=OpticsError('SAVE_UNCERTAIN','timeout')) as worker:
            with self.assertRaises(OpticsError):bridge.save_model(request)
            with self.assertRaises(OpticsError):bridge.save_model(request)
            self.assertEqual(worker.call_count,1)

    def test_candidate_save_does_not_rebind(self):
        bridge,request=self.bridge_fixture();other=copy.deepcopy(self.raw);other['sourceFile']=str(self.root/'other.zmx');other['captureEvidence']['dirtyAfter']=False
        snap=make_snapshot(other);candidate={'sourceFile':other['sourceFile'],'instance':3,'modelId':snap['modelId'],'revision':snap['revision'],'systemId':'primary','dirty':True}
        with patch.object(bridge,'_worker',return_value=candidate):token=bridge.probe(3)['candidateId']
        with patch.object(bridge,'_save_worker',return_value={'raw':other,'saved':{'status':'saved'}}):
            result=bridge.save_model({**request,'candidateId':token})
        self.assertEqual(bridge.config['expectedFile'],str(self.file));self.assertFalse(result['candidate']['dirty'])

    def test_save_uses_existing_capture_mutex(self):
        bridge,request=self.bridge_fixture();bridge.capture_lock.acquire()
        try:
            with self.assertRaises(OpticsError) as e:bridge.save_model(request)
            self.assertEqual(e.exception.code,'HOST_BUSY')
        finally:bridge.capture_lock.release()

    def test_worker_consumes_frozen_config_and_refuses_run_replay(self):
        (self.root/'.runtime').mkdir()
        config={**self.config,'projectRoot':str(self.root),'sourceRoot':str(self.root),
                'authorization':'explicit-save-button'}
        bundle=RunBundle.create(self.root,'model-save',config,mode='execute',complexity='simple')
        zos=self.zos
        class Connection:
            def __init__(self,**kwargs):self.options=kwargs
            def __enter__(self):return zos
            def __exit__(self,*args):pass
        with patch('optdsh_optics.connection.OpticStudio',Connection):
            result=execute_save_run(bundle.path)
            self.assertTrue(result['ok']);self.assertEqual(self.calls,1)
            again=execute_save_run(bundle.path);self.assertFalse(again['ok']);self.assertEqual(self.calls,1)
        manifest=json.loads((bundle.path/'manifest.json').read_text())
        self.assertEqual(manifest['status'],'completed');self.assertIn('backup/model-before.zmx',manifest['files'])
        self.assertTrue((bundle.path/'report.md').is_file())
