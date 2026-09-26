"""Package approved full-frame dancer masks with original RGB and explicit timestamps."""
import argparse, hashlib, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from preprocess import package
from package_instances import package_instances
ROOT=Path(__file__).resolve().parents[1]
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True);ap.add_argument('--masks',type=Path,default=ROOT/'.cache/masks/final');args=ap.parse_args()
    for frame in range(581):
        assert (args.masks/f'{frame:05d}.png').exists(),f'Missing mask {frame}'
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(args.source)]))
    times=[float(frame['best_effort_timestamp_time']) for frame in probe['frames']];assert len(times)==581
    output=ROOT/'public/volume';output.mkdir(parents=True,exist_ok=True)
    provenance=json.loads((args.masks/'provenance.json').read_text())
    manifest=dict(version=1,source=args.source.name,sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),duration=581*1001/24000,
        crop=dict(x=0,y=0,width=1280,height=544),processing=provenance,tiers={})
    for name,width,height,depth in [('desktop',800,340,360),('compact',400,170,240)]:
        ids=np.rint(np.linspace(0,580,depth)).astype(int).tolist()
        expression='+'.join(f'eq(n,{i})' for i in ids)
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(args.source),'-vf',f"select='{expression}',scale={width}:{height}:flags=lanczos",'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','-an','-'])
        rgb=np.frombuffer(raw,np.uint8).reshape(depth,height,width,3)
        masks=np.stack([np.asarray(Image.open(args.masks/f'{idx:05d}.png').resize((width,height),Image.Resampling.BOX)) for idx in ids])
        # Preserve coverage at edges, exact opaque interiors, and original RGB at alpha zero.
        manifest['tiers'][name]=package(rgb,masks,name,[times[i] for i in ids],ids,output)
        print(f'Packaged {name}: {width}x{height}x{depth}',flush=True)
    package_instances(manifest,args.masks,output)
    tmp=output/'manifest.tmp';tmp.write_text(json.dumps(manifest,indent=2));tmp.replace(output/'manifest.json')
if __name__=='__main__':main()
