import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from optdsh_optics.object_labels import object_label
from optdsh_optics.reporting import build_html


class ObjectLabelTests(unittest.TestCase):
    def test_empty_and_missing_evidence_are_distinct(self):
        self.assertEqual(object_label(18,{'comment':'for rotate'}),'OBJ18[for rotate]')
        self.assertEqual(object_label(18,{'comment':''}),'OBJ18[无 comment]')
        self.assertEqual(object_label(18),'OBJ18[comment未记录]')
        self.assertEqual(object_label(5,{'comment':'STOP'},'SURF'),'SURF5[STOP]')

    def test_observed_comment_wins_over_expected(self):
        self.assertEqual(object_label(3,{'comment':'','expectedComment':'old'}),'OBJ3[无 comment]')

    def test_report_escapes_comment_markup(self):
        manifest={'workflow':'test','runId':'260927-01','createdAt':'2026-09-27T00:00:00+08:00','mode':'plan'}
        config={'lenses':[{'index':2,'expectedComment':'<script>bad</script>'}]}
        page=build_html(manifest,{'status':'planned'},config)
        self.assertIn('OBJ2[&lt;script&gt;bad&lt;/script&gt;]',page)
        self.assertNotIn('<script>bad</script>',page)


if __name__=='__main__':unittest.main()
