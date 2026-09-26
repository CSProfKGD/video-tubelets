"""Select reviewed directional masks without temporal averaging or ghost silhouettes."""
import argparse,hashlib,json,platform
from pathlib import Path
import numpy as np
from PIL import Image
import torch,ultralytics
from clean_masks import clean_mask,fill_matching_pinholes
ap=argparse.ArgumentParser();ap.add_argument('--selection',type=Path,default=Path('scripts/mask-selection.json'));args=ap.parse_args()
selection=json.loads(args.selection.read_text());root=Path('.cache/masks');out=root/'final';out.mkdir(parents=True,exist_ok=True)
coverage=[];cleanup=[];pinholes=[]
for frame in range(581):
    direction=selection['default']
    for override in selection.get('ranges',[]):
        if override['start']<=frame<=override['end']:direction=override['direction']
    masks=[np.array(Image.open(root/direction/f'{frame:05d}-{identity}.png')) for identity in range(2)]
    for patch in selection.get('patches',[]):
        if patch['start']<=frame<=patch['end']:
            identity=patch['identity'];x0,y0,x1,y1=patch['box']
            corrected=np.array(Image.open(root/patch['direction']/f'{frame:05d}-{identity}.png'))
            masks[identity][y0:y1,x0:x1]=corrected[y0:y1,x0:x1]
    assert all(m.shape==(544,1280) and m.max()==255 for m in masks)
    rgb=np.array(Image.open(f'.cache/teaser/rgb/{frame:05d}.png')) if selection.get('refineInteriorHoles') else None
    for identity in range(2):
        masks[identity],removed=clean_mask(masks[identity])
        cleanup.extend(dict(frame=frame,identity=identity,**item) for item in removed)
        if rgb is not None:
            masks[identity],filled=fill_matching_pinholes(masks[identity],rgb)
            pinholes.extend(dict(frame=frame,identity=identity,**item) for item in filled)
    union=np.maximum.reduce(masks);Image.fromarray(union).save(out/f'{frame:05d}.png')
    labels=np.where(masks[1]>0,255,np.where(masks[0]>0,128,0)).astype(np.uint8)
    Image.fromarray(labels).save(out/f'{frame:05d}-instances.png')
    coverage.append(float(np.mean(union>0)))
provenance=dict(model='SAM 2.1 large',checkpointSha256=hashlib.sha256(Path('.cache/models/sam2.1_l.pt').read_bytes()).hexdigest(),
    implementation=f'Ultralytics {ultralytics.__version__} SAM2VideoPredictor',torch=torch.__version__,python=platform.python_version(),
    sourceFrameCount=581,identities=['central female dancer','central male dancer'],prompts=json.loads(Path(selection.get('prompts','scripts/dancer-prompts.json')).read_text()),
    selection=selection,temporalAveraging=False,cleanup=dict(method="8-connected components; remove area <=32 source pixels only when >20 pixels from main person",removed=cleanup),pinholes=dict(method='Fill enclosed holes <=12px only when median source RGB differs from foreground rim by <=18 RGB units',filled=pinholes),downsampling='area coverage (Pillow BOX); opaque interiors; RGB retained independently',
    coverage=dict(min=min(coverage),max=max(coverage),mean=float(np.mean(coverage))),
    trackingRuns=[json.loads(p.read_text()) for d in sorted({selection['default']}|{r['direction'] for r in selection.get('ranges',[])+selection.get('patches',[])}) for p in (root/d).glob('provenance-*.json')])
(out/'provenance.json').write_text(json.dumps(provenance,indent=2));print(json.dumps(provenance['coverage']))
