"""Local SAM 2.1 video tracking with source-coordinate, per-identity corrections."""
import argparse, hashlib, json, os, time
from pathlib import Path
os.environ.setdefault('YOLO_CONFIG_DIR', str(Path('.cache/ultralytics').resolve()))
import cv2
import numpy as np
from PIL import Image
import torch
from ultralytics.models.sam import SAM2VideoPredictor

ROOT = Path(__file__).resolve().parents[1]
class PromptedTracker(SAM2VideoPredictor):
    def inference(self, im, bboxes=None, points=None, labels=None, masks=None):
        frame = self.dataset.frame - 1
        source_frame = self.total - 1 - frame if self.reverse else frame + self.offset
        prompt = self.corrections.get(str(source_frame))
        if frame==0 and self.seed is not None:
            self.inference_state['im']=im
            _,_,masks=self._prepare_prompts(im.shape[2:],self.src_shape,None,None,None,self.seed)
            for identity in range(2):
                self.add_new_prompts(obj_id=identity,masks=masks[identity:identity+1,None],frame_idx=self.dataset.frame)
        elif prompt:
            self.inference_state['im'] = im
            points, labels, _ = self._prepare_prompts(im.shape[2:], self.src_shape, None,
                prompt['points'], prompt['labels'], None)
            for identity in range(2):
                self.add_new_prompts(obj_id=identity, points=points[[identity]], labels=labels[[identity]], frame_idx=self.dataset.frame)
        return super().inference(im)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--source',required=True,type=Path)
    ap.add_argument('--reverse',action='store_true')
    ap.add_argument('--limit',type=int,default=581)
    ap.add_argument('--device',default='mps')
    ap.add_argument('--start',type=int,default=0)
    ap.add_argument('--seed',type=Path)
    ap.add_argument('--prompts',type=Path,default=ROOT/'scripts/dancer-prompts.json')
    ap.add_argument('--output',type=Path)
    ap.add_argument('--crop',type=int,nargs=4,metavar=('X','Y','W','H'))
    args=ap.parse_args()
    torch.set_num_threads(6)
    checkpoint=ROOT/'.cache/models/sam2.1_l.pt'
    prompts=json.loads(args.prompts.read_text())
    direction='reverse' if args.reverse else 'forward'
    out=args.output or ROOT/'.cache/masks'/direction; out.mkdir(parents=True,exist_ok=True)
    tracker=PromptedTracker(overrides=dict(model=str(checkpoint),task='segment',mode='predict',imgsz=1024,
        device=args.device,verbose=False,save=False,retina_masks=True,half=False))
    tracker.corrections=json.loads(json.dumps(prompts))
    if args.crop:
        for prompt in tracker.corrections.values():
            for identity in prompt['points']:
                for point in identity:point[0]-=args.crop[0];point[1]-=args.crop[1]
    tracker.total=581; tracker.reverse=args.reverse; tracker.offset=args.start
    tracker.seed=np.stack([np.array(Image.open(args.seed/f'{args.start:05d}-{i}.png'))>0 for i in range(2)]) if args.seed else None
    if args.crop and tracker.seed is not None:
        x,y,w,h=args.crop;tracker.seed=tracker.seed[:,y:y+h,x:x+w]
    start=time.time(); stats=[]
    provenance=dict(model='SAM 2.1 large',implementation='Ultralytics SAM2VideoPredictor',
        checkpointSha256=hashlib.sha256(checkpoint.read_bytes()).hexdigest(),source=str(args.source),analysisVideoSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),direction=direction,
        start=args.start,seed=str(args.seed) if args.seed else None,prompts=prompts,sourceCoordinateCrop=args.crop)
    def save_progress():
        (out/f'provenance-{args.start}.json').write_text(json.dumps(dict(provenance,seconds=time.time()-start,frames=stats),indent=2))
    save_progress()
    for i,result in enumerate(tracker(source=str(args.source),stream=True)):
        source_frame=580-i if args.reverse else i+args.start
        if result.masks is None or len(result.masks.data)!=2:
            raise RuntimeError(f'Expected both identities at source frame {source_frame}')
        masks=result.masks.data.cpu().numpy().astype(np.uint8)
        for identity,mask in enumerate(masks):
            if args.crop:
                x,y,w,h=args.crop
                if mask.shape!=(h,w):mask=cv2.resize(mask,(w,h),interpolation=cv2.INTER_NEAREST)
                canvas=np.zeros((544,1280),np.uint8);canvas[y:y+h,x:x+w]=mask;mask=canvas
            elif mask.shape!=(544,1280): mask=cv2.resize(mask,(1280,544),interpolation=cv2.INTER_NEAREST)
            Image.fromarray(mask*255).save(out/f'{source_frame:05d}-{identity}.png')
        stats.append({'frame':source_frame,'areas':[int(m.sum()) for m in masks]})
        if i%20==0: save_progress()
        if i%20==0: print(f'{direction}: {i+1}/581, {time.time()-start:.1f}s, areas={stats[-1]["areas"]}',flush=True)
        if i+1>=args.limit: break
    save_progress()
if __name__=='__main__': main()
