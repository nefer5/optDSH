"""Historical import CLI tests using synthetic bytes in isolated user directories."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'packages/optics/src'))
from optdsh_optics.run_bundle import sha

TEST_TEMP=ROOT/'temp/optics-import-tests'
TEST_TEMP.mkdir(parents=True,exist_ok=True)
SCRIPT=ROOT/'scripts/maintenance/import-tx-run.py'


class HistoricalImportTests(unittest.TestCase):
    def fixture(self, root):
        source=root/'合成历史输入';source.mkdir()
        result={'status':'planned','provenance':'synthetic','config':{'report':{'background':'Synthetic import fixture','objective':'Copy bytes only'}}}
        (source/'result.json').write_text(json.dumps(result),encoding='utf-8')
        (source/'nested').mkdir();(source/'nested/evidence.txt').write_bytes(b'fixture, never an optical measurement')
        return source

    def cli(self, workspace, source, *args):
        return subprocess.run([sys.executable,str(SCRIPT),str(source),*args],cwd=workspace,capture_output=True,text=True,encoding='utf-8',timeout=20)

    def test_explicit_workspace_dry_run_then_copy_in_two_external_directories(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            sandbox=Path(tmp);source=self.fixture(sandbox)
            hashes={str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file()}
            for name in ('外部课题 A','另一项研究 空格'):
                workspace=sandbox/name;workspace.mkdir()
                dry=self.cli(workspace,source,'--workspace',str(workspace),'--dry-run')
                self.assertEqual(dry.returncode,0,dry.stderr)
                plan=json.loads(dry.stdout)
                self.assertEqual(plan['runsRoot'],str(workspace/'runs/tx'))
                self.assertFalse(plan['executesOptics'])
                self.assertFalse((workspace/'runs').exists())
                self.assertFalse((workspace/'STUDYS').exists())
                copied=self.cli(workspace,source,'--workspace',str(workspace),'--execute')
                self.assertEqual(copied.returncode,0,copied.stderr)
                receipt=json.loads(copied.stdout);run=Path(receipt['run'])
                self.assertTrue(run.is_relative_to(workspace))
                for relative,digest in hashes.items():self.assertEqual(sha(run/'original'/relative),digest)
                manifest=json.loads((run/'manifest.json').read_text())
                self.assertEqual(manifest['mode'],'import')
                self.assertEqual(manifest['workspaceRoot'],str(workspace))
                self.assertEqual(manifest['import']['sourceResultSha256'],hashes['result.json'])
                self.assertTrue((run/'report.html').is_file())
            self.assertEqual(hashes,{str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file()})

    def test_missing_workspace_escape_and_source_overlap_refused_without_outputs(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            sandbox=Path(tmp);source=self.fixture(sandbox)
            workspace=sandbox/'用户研究';workspace.mkdir()
            missing=self.cli(workspace,source)
            self.assertNotEqual(missing.returncode,0);self.assertIn('--workspace',missing.stderr)
            escaped=self.cli(workspace,source,'--workspace',str(workspace),'--runs-root','../escape','--execute')
            self.assertNotEqual(escaped.returncode,0)
            self.assertFalse((sandbox/'escape').exists())
            self.assertFalse((workspace/'runs').exists())
            overlap=self.cli(workspace,source,'--workspace',str(sandbox),'--runs-root',str(source/'new-runs'),'--execute')
            self.assertNotEqual(overlap.returncode,0)
            self.assertFalse((source/'new-runs').exists())


if __name__=='__main__':unittest.main()
