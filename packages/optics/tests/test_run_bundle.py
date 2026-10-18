from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
import json
import os
import shutil
import sys
import tempfile
import unittest
from html.parser import HTMLParser
ROOT = next(p for p in Path(__file__).resolve().parents if (p/"packages/optics/src").is_dir() and (p/"package.json").is_file());sys.path.insert(0,str(ROOT/'packages/optics/src'))
from optdsh_optics.run_bundle import RunBundle,checked,sha
TEST_TEMP=ROOT/'temp/optics-workspace-tests'
TEST_TEMP.mkdir(parents=True,exist_ok=True)

class RunBundleTests(unittest.TestCase):
    def test_two_plain_workspaces_need_no_study_layout_or_installation_files(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            sandbox=Path(tmp)
            for name in ('课题甲 光学研究','课题乙 external workspace'):
                workspace=sandbox/name;workspace.mkdir()
                config=workspace/'配置/input.yaml';config.parent.mkdir();config.write_text('value: 1\n')
                bundle=RunBundle.create(workspace,'rx',{'value':1},source='配置/input.yaml')
                self.assertEqual(bundle.path.parent,workspace/'runs/rx')
                self.assertEqual(bundle.manifest['workspaceRoot'],str(workspace))
                self.assertEqual((bundle.path/'config/input.yaml').read_text(),'value: 1\n')
                self.assertFalse((workspace/'STUDYS').exists())
                self.assertFalse((workspace/'package.json').exists())
                explicit=RunBundle.create(workspace,'rx',{},root='results/custom')
                self.assertEqual(explicit.path.parent,workspace/'results/custom')

    def test_optional_nearest_study_marker_and_external_input_are_bounded(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            workspace=Path(tmp)/'工作区';workspace.mkdir()
            study=workspace/'任意目录/子课题';source=study/'configs/case.yaml'
            source.parent.mkdir(parents=True);source.write_text('value: 1\n')
            (study/'study.yaml').write_text('name: 子课题\n')
            bundle=RunBundle.create(workspace,'tx',{},source=source)
            self.assertEqual(bundle.path.parent,study/'runs/tx')
            outside=Path(tmp)/'外部输入.yaml';outside.write_text('value: 2\n')
            external=RunBundle.create(workspace,'tx',{},source=outside)
            self.assertEqual(external.path.parent,workspace/'runs/tx')
            with self.assertRaises(ValueError):RunBundle.create(workspace,'tx',{},root='../越界')

    def test_output_link_escape_is_rejected_before_any_report_write(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            workspace=Path(tmp)/'研究';workspace.mkdir()
            outside=Path(tmp)/'outside';outside.mkdir()
            protected=outside/'protected.txt';protected.write_text('unchanged')
            link=workspace/'linked-runs'
            try:os.symlink(outside,link,target_is_directory=True)
            except OSError as exc:self.skipTest('Symbolic links unavailable: '+str(exc))
            with self.assertRaises(ValueError):RunBundle.create(workspace,'tx',{},root=link)
            bundle=RunBundle.create(workspace,'tx',{})
            os.symlink(protected,bundle.path/'report.html')
            with self.assertRaises(ValueError):bundle.finish('planned',{'status':'planned'})
            self.assertEqual(protected.read_text(),'unchanged')
            self.assertFalse((bundle.path/'result.json').exists())

    def test_study_config_keeps_new_run_local_and_explicit_root_wins(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as d:
            root=Path(d);source=root/'STUDYS/demo/configs/case.yaml'
            source.parent.mkdir(parents=True);source.write_text('case: demo\n')
            b=RunBundle.create(root,'tx',{'case':'demo'},source=source)
            self.assertEqual(b.path.parent,root/'STUDYS/demo/runs/tx')
            c=RunBundle.create(root,'tx',{'case':'demo'},source=source,root=root/'runs/explicit')
            self.assertEqual(c.path.parent,root/'runs/explicit')

    def test_report_order_curated_setup_and_folded_raw_config(self):
        class Inspect(HTMLParser):
            def __init__(self):super().__init__();self.depth=0;self.chapters=[];self.raw_outside=False;self.open_details=False
            def handle_starttag(self,tag,attrs):
                attrs=dict(attrs)
                if tag=='details':self.depth+=1;self.open_details|='open' in attrs
                if tag=='pre' and not self.depth:self.raw_outside=True
                if tag=='section':self.chapters.append(attrs.get('id'))
            def handle_endtag(self,tag):
                if tag=='details':self.depth-=1
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            root=Path(tmp);raw=b'# keep this comment\ncustom: hidden\n';source=root/'config.yaml';source.write_bytes(raw)
            b=RunBundle.create(root,'tx',{'custom':'hidden','report':{'background':'Research question','objective':'Target'}},source=source)
            b.finish('planned',{'status':'planned'})
            page=(b.path/'report.html').read_text(encoding='utf-8');parser=Inspect();parser.feed(page)
            self.assertEqual(parser.chapters,['background','setup','results','evidence'])
            self.assertFalse(parser.raw_outside);self.assertFalse(parser.open_details)
            self.assertIn('Research question',page);self.assertIn('# keep this comment',page)
            self.assertIn('未记录；不能由当前模型补推',page)

    def test_simple_markdown_and_complex_format_guard(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            root=Path(tmp)
            b=RunBundle.create(root,'check',{'report':{'background':'A small check','objective':'Verify one value'}},complexity='simple')
            b.finish('completed',{'status':'completed','report':{'summary':'Value verified'}})
            self.assertEqual(b.manifest['report'],'report.md')
            self.assertFalse((b.path/'report.html').exists())
            self.assertIn('Value verified',(b.path/'report.md').read_text())
            self.assertIn('report.md',b.manifest['files'])
            with self.assertRaises(ValueError):RunBundle.create(root,'check',{},report_format='md')
            c=RunBundle.create(root,'check',{},complexity='simple')
            with self.assertRaises(ValueError):c.finish('completed',{'cases':[{},{}]})

    def test_atomic_short_allocation_and_immutable_config(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            root=Path(tmp);source=root/'input.json';source.write_text('{"value":1}',encoding='utf-8')
            def create(_):return RunBundle.create(root,'tx',{'value':1},source=source,now=datetime(2026,9,26))
            with ThreadPoolExecutor(max_workers=4) as pool:bundles=list(pool.map(create,range(8)))
            self.assertEqual({b.path.name for b in bundles},{f'260926-{i:02d}' for i in range(1,9)})
            source.write_text('{"value":2}',encoding='utf-8')
            for b in bundles:
                self.assertEqual(json.loads((b.path/'config/resolved.json').read_text())['value'],1)
                self.assertEqual(json.loads((b.path/'config/input.json').read_text())['value'],1)

    def test_failure_report_portability_hashes_and_escaping(self):
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
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
        with tempfile.TemporaryDirectory(dir=TEST_TEMP) as tmp:
            root=Path(tmp);b=RunBundle.create(root,'tx',{})
            with self.assertRaises(ValueError):b.write('../outside.json',{})
            with self.assertRaises(ValueError):checked(root/('a'*221),root)
            with self.assertRaises(ValueError):RunBundle.create(root,'../tx',{})
            b.write('one.json',{})
            with self.assertRaises(FileExistsError):b.copy(b.path/'one.json','one.json')

if __name__=='__main__':unittest.main()
