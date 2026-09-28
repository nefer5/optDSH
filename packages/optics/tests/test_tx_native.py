import unittest
from copy import deepcopy
from optdsh_optics.tx_native import validate
from optdsh_optics.domain import OpticsError

class NativeContract(unittest.TestCase):
    def setUp(self):
        self.snapshot={'modelId':'m','revision':'r','objects':[]}
        for i,typ in [(1,'Null Object'),(2,'Source Diode'),(3,'Source Diode'),(7,'Standard Lens'),(37,'Detector Rectangle'),(38,'Detector Rectangle')]:
            self.snapshot['objects'].append({'objectId':str(i),'sourceIndex':i,'label':str(i),'type':typ,'worldPositionMM':[0,0,10011],'localPositionMM':[0,0,1],'referenceIndex':36,'worldAxes':{'z':[0,0,1]}})
        self.config={'schemaVersion':1,'modelId':'m','expectedRevision':'r','geometryConfirmed':True,'blindParts':[{'objectId':'7','axes':{'x':{'min':-.1,'max':.1}}}],'coupledParts':[],'targets':[{'name':'die1','sourceId':'2','detectorId':'37','axis':'X'},{'name':'die2','sourceId':'3','detectorId':'38','axis':'X'}],'analysis':{'mode':'sensitivity','method':'none'}}
    def test_resolved_config_revalidates_and_uses_global_z(self):
        c=validate(self.config,self.snapshot)
        self.assertEqual(c['analysis']['runs'],0)
        self.assertEqual(c['targets'][0]['distanceMM'],10011)
        self.assertEqual(validate(c,self.snapshot),c)
    def test_stale_revision_rejected(self):
        self.config['expectedRevision']='old'
        with self.assertRaises(OpticsError):validate(self.config,self.snapshot)
    def test_colliding_targets_rejected(self):
        self.config['targets'][1]['detectorId']='37'
        with self.assertRaises(OpticsError):validate(self.config,self.snapshot)
    def test_nonfinite_ranges_rejected(self):
        self.config['blindParts'][0]['axes']['x']['max']=float('nan')
        with self.assertRaises(OpticsError):validate(self.config,self.snapshot)
    def test_geometry_ack_and_positive_z_required(self):
        self.config['geometryConfirmed']=False
        with self.assertRaises(OpticsError):validate(self.config,self.snapshot)
        self.config['geometryConfirmed']=True;self.snapshot['objects'][-1]['worldPositionMM'][2]=-1
        with self.assertRaises(OpticsError):validate(self.config,self.snapshot)
    def test_compensation_requires_control(self):
        self.config['analysis']['method']='OD'
        with self.assertRaises(OpticsError):validate(self.config,self.snapshot)

if __name__=='__main__':unittest.main()
