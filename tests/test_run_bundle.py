from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
import json
import shutil
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
from optdsh_optics.run_bundle import RunBundle,checked,sha

class RunBundleTests(unittest.TestCase):
    def test_atomic_short_allocation_and_immutable_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'input.json';source.write_text('{"value":1}',encoding='utf-8')
            def create(_):return RunBundle.create(root,'tx',{'value':1},source=source,now=datetime(2026,9,26))
            with ThreadPoolExecutor(max_workers=4) as pool:bundles=list(pool.map(create,range(8)))
            self.assertEqual({b.path.name for b in bundles},{f'260926-{i:02d}' for i in range(1,9)})
            source.write_text('{"value":2}',encoding='utf-8')
            for b in bundles:
                self.assertEqual(json.loads((b.path/'config/resolved.json').read_text())['value'],1)
                self.assertEqual(json.loads((b.path/'config/input.json').read_text())['value'],1)

    def test_failure_report_portability_hashes_and_escaping(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);b=RunBundle.create(root,'tx',{'label':'<script>alert(1)</script>'})
            b.finish('failed',{'status':'failed','error':'<img src=x onerror=alert(1)>'})
            copied=root/'moved';shutil.copytree(b.path,copied)
            m=json.loads((copied/'manifest.json').read_text())
            for relative,info in m['files'].items():self.assertEqual(sha(copied/relative),info['sha256'])
            report=(copied/'report.html').read_text(encoding='utf-8')
            self.assertIn('failed',report);self.assertNotIn('<script>',report);self.assertNotIn('<img src=x',report)
            self.assertIn('&lt;script&gt;',report)
            for link in ('config/resolved.json','manifest.json','result.json'):self.assertTrue((copied/link).exists())

    def test_paths_cannot_escape_or_grow_indefinitely(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);b=RunBundle.create(root,'tx',{})
            with self.assertRaises(ValueError):b.write('../outside.json',{})
            with self.assertRaises(ValueError):checked(root/('a'*221),root)
            with self.assertRaises(ValueError):RunBundle.create(root,'../tx',{})
            b.write('one.json',{})
            with self.assertRaises(FileExistsError):b.copy(b.path/'one.json','one.json')

if __name__=='__main__':unittest.main()
