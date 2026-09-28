import unittest
from copy import deepcopy
from optdsh_optics.tx_custom import process,validate
from optdsh_optics.domain import OpticsError

class ToyDriver:
    def __init__(self):self.evaluations=0;self.blind=[0.];self.controls=[0.];self.saved={};self.calls=[]
    def set_offsets(self,b,c):self.blind=b[:];self.controls=c[:];self.calls.append((b[:],c[:]))
    def measure(self,label,save):
        self.evaluations+=1
        v=1+(self.blind[0]+self.controls[0]-.05)**2
        return [{'name':'die1','rmsMM':v,'angleMrad':v,'power':1.},{'name':'die2','rmsMM':v,'angleMrad':v,'power':1.}]
    def save_model(self,name):self.saved[name]=(self.blind[:],self.controls[:])

def fixture():
    s={'modelId':'m','revision':'r','objects':[]}
    for i,typ in [(1,'Null Object'),(2,'Source Diode'),(3,'Source Diode'),(7,'Standard Lens'),(37,'Detector Rectangle'),(38,'Detector Rectangle')]:
        s['objects'].append({'poseSolves':{f:{'type':'Fixed','column':j+4} for j,f in enumerate(('XPosition','YPosition','ZPosition','TiltAboutX','TiltAboutY','TiltAboutZ'))},'objectId':str(i),'sourceIndex':i,'label':str(i),'type':typ,'referenceIndex':0,'worldPositionMM':[0,0,1000],'localPositionMM':[0,0,1000],'worldAxes':{'z':[0,0,1]}})
    c={'schemaVersion':1,'modelId':'m','expectedRevision':'r','geometryConfirmed':True,'blindParts':[{'objectId':'7','axes':{'x':{'min':-.01,'max':.01}}}],'coupledParts':[{'objectId':'1','axes':{'z':{'min':-.1,'max':.1}}}],'targets':[{'name':'die1','sourceId':'2','detectorId':'37','axis':'X'},{'name':'die2','sourceId':'3','detectorId':'38','axis':'X'}],'analysis':{'mode':'custom','method':'coordinate','runs':3},'custom':{'referenceChainConfirmed':True,'rounds':1,'stepFraction':.25}}
    return c,s

class CustomWorkflow(unittest.TestCase):
    def test_blocks_unexpected_descendants(self):
        c,s=fixture();s['objects'][1]['referenceIndex']=7
        with self.assertRaisesRegex(OpticsError,'参考链'):validate(c,s)
    def test_only_last_is_compensated_and_final_error_is_preserved(self):
        c,s=fixture();c=validate(c,s);d=ToyDriver();r=process(c,d)
        self.assertEqual(len(r['samples']),3)
        self.assertIsNone(r['samples'][0]['after']);self.assertIsNone(r['samples'][1]['after'])
        self.assertIsNotNone(r['samples'][2]['after'])
        expected=[r['samples'][-1]['offsets'][0]['delta']]
        self.assertEqual(d.saved['last-mc.zos'][0],expected)
        self.assertEqual(d.saved['final-compensated.zos'][0],expected)
        self.assertLessEqual(r['compensation']['after'][0]['angleMrad'],r['compensation']['before'][0]['angleMrad'])
        self.assertTrue(any(x['phase']=='post-compensation-local' for x in r['sensitivity']))
    def test_custom_validation_is_idempotent(self):
        c,s=fixture();a=validate(c,s);self.assertEqual(validate(a,s),a)
    def test_none_does_not_invent_compensation(self):
        c,s=fixture();c['analysis']['method']='none';d=ToyDriver();r=process(validate(c,s),d)
        self.assertFalse(r['compensation']['performed']);self.assertIsNone(r['samples'][-1]['after'])
    def test_cancel_stops_orchestration(self):
        c,s=fixture();d=ToyDriver()
        with self.assertRaises(InterruptedError):process(validate(c,s),d,cancel=lambda:(_ for _ in ()).throw(InterruptedError()))

if __name__=='__main__':unittest.main()
