"""Add coverage-weighted identity chunks without re-encoding existing RGB."""
import json, gzip, hashlib
from pathlib import Path
import numpy as np
from PIL import Image

def package_instances(manifest, masks, output):
    for name,tier in manifest['tiers'].items():
        width,height=tier['width'],tier['height']
        for chunk in tier['chunks']:
            ids=tier['sourceFrames'][chunk['start']:chunk['start']+chunk['count']]
            labels=np.stack([np.asarray(Image.open(masks/f'{idx:05d}-instances.png').resize((width,height),Image.Resampling.BOX)) for idx in ids])
            relative=f"{name}/instance-{chunk['start']:04d}.png"
            Image.fromarray(labels.reshape(-1,width)).save(output/relative,optimize=True)
            chunk['instance']=relative
        tier['gpuBytes']=width*height*tier['depth']*5
    # Semantic bytes bypass canvas readback, which some browsers perturb.
    for tier in manifest['tiers'].values():
        for chunk in tier['chunks']:
            for field in ['mask','instance']:
                raw=np.asarray(Image.open(output/chunk[field]),dtype=np.uint8).tobytes()
                relative=chunk[field].replace('.png','.bin')
                (output/relative).write_bytes(gzip.compress(raw,mtime=0))
                chunk[field+'Data']=relative
                chunk[field+'Sha256']=hashlib.sha256(raw).hexdigest()
    manifest['semanticEncoding']='gzip-compressed uint8, row-major, source Y-down; SHA-256 of uncompressed bytes'
    manifest['instanceEncoding']={'background':0,'woman':128,'man':255,'filter':'area coverage; divide by union coverage when sampling','colors':['#63e6de','#ff9f7a']}

if __name__=='__main__':
    output=Path('public/volume');path=output/'manifest.json'
    manifest=json.loads(path.read_text())
    # Refresh union coverage as well, so identity cleanup stays aligned with alpha.
    for tier in manifest['tiers'].values():
        for chunk in tier['chunks']:
            ids=tier['sourceFrames'][chunk['start']:chunk['start']+chunk['count']]
            masks=np.stack([np.asarray(Image.open(f'.cache/masks/final/{idx:05d}.png').resize((tier['width'],tier['height']),Image.Resampling.BOX)) for idx in ids])
            Image.fromarray(masks.reshape(-1,tier['width'])).save(output/chunk['mask'],optimize=True)
    manifest['processing']=json.loads(Path('.cache/masks/final/provenance.json').read_text())
    package_instances(manifest,Path('.cache/masks/final'),output)
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(manifest,indent=2));tmp.replace(path)
