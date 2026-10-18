import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from optdsh_optics.run_bundle import RunBundle


class FormsPreparedRunTests(unittest.TestCase):
    def fixture(self):
        base=Path(__file__).resolve().parents[3]/'temp'/'forms-prepared-tests'
        base.mkdir(parents=True,exist_ok=True)
        workspace=Path(tempfile.mkdtemp(prefix='case-',dir=base))
        path=workspace/'runs'/'rx-fov'/'261018-01'
        (path/'config').mkdir(parents=True)
        source=path/'config'/'input.yaml'
        raw=b'# exact input\nvalue: 7\n'
        source.write_bytes(raw)
        manifest={'schemaVersion':1,'runId':path.name,'workflow':'rx-fov','status':'prepared','workspaceRoot':str(workspace.resolve()),'inputConfig':'config/input.yaml','forms':{'documentId':'yaml-test','inputSha256':hashlib.sha256(raw).hexdigest()}}
        (path/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
        return workspace,path,source,raw

    def test_claims_same_run_preserves_input_and_refuses_second_execution(self):
        workspace,path,source,raw=self.fixture()
        bundle=RunBundle.create(workspace,'rx-fov',{'value':7},source=source,source_bytes=raw)
        self.assertEqual(bundle.path,path.resolve())
        self.assertEqual(len(list((workspace/'runs'/'rx-fov').iterdir())),1)
        self.assertEqual(source.read_bytes(),raw)
        self.assertEqual(bundle.manifest['status'],'created')
        with self.assertRaisesRegex(ValueError,'already claimed'):
            RunBundle.create(workspace,'rx-fov',{'value':7},source=source,source_bytes=raw)

    def test_changed_frozen_file_is_rejected_without_another_run(self):
        workspace,path,source,raw=self.fixture();source.write_text('value: 99\n')
        with self.assertRaisesRegex(ValueError,'changed after submission'):
            RunBundle.create(workspace,'rx-fov',{'value':7},source=source,source_bytes=raw)
        self.assertEqual(len(list((workspace/'runs'/'rx-fov').iterdir())),1)

    def test_wrong_workflow_is_rejected(self):
        workspace,path,source,raw=self.fixture()
        with self.assertRaisesRegex(ValueError,'identity differs'):
            RunBundle.create(workspace,'different',{'value':7},source=source,source_bytes=raw)


if __name__=='__main__':unittest.main()
