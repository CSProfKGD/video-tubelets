"""Generate reproducible source/overlay/cutout contact sheets and full-sequence QA video."""
import argparse, json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
ap=argparse.ArgumentParser(); ap.add_argument('--source',required=True);ap.add_argument('--direction',default='forward');ap.add_argument('--video',action='store_true');args=ap.parse_args()
folder=Path('.cache/masks')/args.direction
ids=sorted({int(p.stem.split('-')[0]) for p in folder.glob('*-0.png')})
selected=ids[::max(1,len(ids)//24)]
if ids[-1] not in selected:selected.append(ids[-1])
cap=cv2.VideoCapture(args.source)
w,h=640,272
sheet=Image.new('RGB',(w*3,(h+24)*len(selected)))
writer=cv2.VideoWriter(f'.qa/{args.direction}-overlays.mp4',cv2.VideoWriter_fourcc(*'mp4v'),24000/1001,(1280,544)) if args.video else None
stats=[]
for idx in ids:
    cap.set(cv2.CAP_PROP_POS_FRAMES,idx); ok,bgr=cap.read()
    if not ok:raise RuntimeError(idx)
    rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
    masks=[np.array(Image.open(folder/f'{idx:05d}-{i}.png'))>0 for i in range(2)]
    union=masks[0]|masks[1]
    overlay=rgb.copy()
    for mask,color in zip(masks,[(99,230,222),(255,125,190)]): overlay[mask]=(.55*rgb[mask]+.45*np.array(color)).astype(np.uint8)
    if writer is not None:writer.write(cv2.cvtColor(overlay,cv2.COLOR_RGB2BGR))
    if idx in selected:
        row=selected.index(idx)
        for col,arr in enumerate([rgb,overlay,rgb*union[:,:,None]]):
            sheet.paste(Image.fromarray(arr).resize((w,h)),(col*w,row*(h+24)+24))
        ImageDraw.Draw(sheet).text((5,row*(h+24)+4),f'Frame {idx} / {idx*1001/24000:.3f} seconds',fill='white')
    stats.append({'frame':idx,'areas':[int(m.sum()) for m in masks]})
cap.release()
if writer:writer.release()
# Small sheets are easier to inspect at useful resolution.
for start in range(0,len(selected),6):sheet.crop((0,start*(h+24),w*3,min(len(selected),start+6)*(h+24))).save(f'.qa/{args.direction}-sheet-{start//6}.jpg',quality=95)
Path(f'.qa/{args.direction}-areas.json').write_text(json.dumps(stats))
print(f'Reviewed assets: {len(ids)} frames, {len(selected)} contact-sheet samples')
