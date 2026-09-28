from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from optdsh_optics.geometry import display_geometry, classify


class GeometryTests(unittest.TestCase):
    def test_lens_semidiameter_not_diameter(self):
        g=display_geometry({'type':'Standard Lens','shapeParameters':{'Clear1':5,'Edge1':6,'Clear2':5,'Edge2':6,'Thickness':2,'Radius1':10,'Radius2':-10,'Conic1':0,'Conic2':0}})
        self.assertEqual(g['radiusMM'],6)
        self.assertEqual(g['thicknessMM'],2)
        self.assertEqual(g['origin'],'front-vertex')

    def test_volume_starts_at_front_not_center(self):
        g=display_geometry({'type':'Rectangular Volume','shapeParameters':{'X1HalfWidth':2,'Y1HalfWidth':3,'X2HalfWidth':1,'Y2HalfWidth':2,'ZLength':4}})
        self.assertEqual(g['origin'],'front-center');self.assertEqual(g['lengthMM'],4)
        self.assertEqual(g['halfWidth1MM'],2);self.assertEqual(g['halfWidth2MM'],1)

    def test_missing_dimension_is_not_silent_zero(self):
        g=display_geometry({'type':'Detector Rectangle','shapeParameters':{'XHalfWidth':5}})
        self.assertEqual(g['kind'],'marker');self.assertEqual(g['fidelity'],'schematic-not-to-scale')

    def test_boolean_not_operand_mesh(self):
        g=display_geometry({'type':'Boolean Native','shapeParameters':{'ObjectA':7}})
        self.assertEqual(g['kind'],'marker')

    def test_mirror_by_material_not_comment(self):
        self.assertEqual(classify({'type':'Rectangle','material':'MIRROR','comment':'lens'}),'mirror')
        self.assertEqual(classify({'type':'Rectangle','material':'','comment':'filter'}),'plate')

    def test_compound_explicit_proxy(self):
        g=display_geometry({'type':'Compound Lens','shapeParameters':{'IsRectangle':1,'HalfWidthX':3,'HalfWidthY':4,'Thickness':2}})
        self.assertEqual(g['fidelity'],'nominal-proxy');self.assertEqual(g['kind'],'box')

    def test_invalid_dimensions_fallback(self):
        for val in (-1,0,float('nan'),float('inf'),True):
            g=display_geometry({'type':'Ellipse','shapeParameters':{'XHalfWidth':val,'YHalfWidth':3}})
            self.assertEqual(g['kind'],'marker')


if __name__=='__main__':unittest.main()
