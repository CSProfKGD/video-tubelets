"""Independent asset checks and full-sequence forward/backward disagreement report."""
import argparse, hashlib, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image
ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);args=ap.parse_args()
manifest=json.loads(Path('public/volume/manifest.json').read_text())
assert hashlib.sha256(Path(args.source).read_bytes()).hexdigest()==manifest['sourceSha256']
assert manifest['crop']==dict(x=0,y=0,width=1280,height=544)
report={'tiers':{},'gpu':[]}
for name,tier in manifest['tiers'].items():
    assert tier['sourceFrames'][0]==0 and tier['sourceFrames'][-1]==580
    assert all(a<b for a,b in zip(tier['timestamps'],tier['timestamps'][1:]))
    assert tier['gpuBytes']==tier['width']*tier['height']*tier['depth']*5
    checked=0
    for chunk in tier['chunks']:
        masks=np.array(Image.open(Path('public/volume')/chunk['mask'])).reshape(chunk['count'],tier['height'],tier['width'])
        instances=np.array(Image.open(Path('public/volume')/chunk['instance'])).reshape(masks.shape)
        for offset,mask in enumerate(masks):
            idx=tier['sourceFrames'][chunk['start']+offset]
            expected=np.array(Image.open(f'.cache/masks/final/{idx:05d}.png').resize((tier['width'],tier['height']),Image.Resampling.BOX))
            assert np.array_equal(mask,expected),(name,idx)
            expected_instance=np.array(Image.open(f'.cache/masks/final/{idx:05d}-instances.png').resize((tier['width'],tier['height']),Image.Resampling.BOX))
            assert np.array_equal(instances[offset],expected_instance),(name,idx,'instance')
            checked+=1
    report['tiers'][name]={'exactMasks':checked,'exactInstanceMaps':checked}
metadata=Path('.qa/gpu-slices.json')
if metadata.exists():
    tier=manifest['tiers']['desktop']
    for item in json.loads(metadata.read_text()):
        frame=tier['sourceFrames'][item['index']]
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',args.source,'-vf',f"select=eq(n\\,{frame}),scale={tier['width']}:{tier['height']}:flags=lanczos",'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
        expected=np.frombuffer(raw,np.uint8).reshape(tier['height'],tier['width'],3)[::-1]
        actual=np.fromfile(f".qa/gpu-XY-{item['index']}.rgba",np.uint8).reshape(tier['height'],tier['width'],4)[:,:,:3]
        error=int(np.abs(actual.astype(int)-expected.astype(int)).max())
        assert error==0,(frame,error)
        report['gpu'].append({'frame':frame,'maxRGBError':error})
Path('.qa/asset-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
