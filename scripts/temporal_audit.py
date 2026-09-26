"""Audit all masks and make every-frame cutout atlases plus an overlay review video."""
import argparse,json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw
ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);args=ap.parse_args()
cv2.setNumThreads(4)
cap=cv2.VideoCapture(args.source)
writer=cv2.VideoWriter('.qa/dancer-overlays.mp4',cv2.VideoWriter_fourcc(*'mp4v'),24000/1001,(1280,544))
previous_gray=previous_mask=None;rows=[];sheet=None
for frame in range(581):
    ok,bgr=cap.read();assert ok
    rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
    mask=np.array(Image.open(f'.cache/masks/final/{frame:05d}.png'))>0
    assert mask.shape==(544,1280) and mask.any()
    labels=np.array(Image.open(f'.cache/masks/final/{frame:05d}-instances.png'))
    overlay=rgb.copy()
    for identity,color in [(128,[99,230,222]),(255,[255,159,122])]:
        person=labels==identity;overlay[person]=(.6*rgb[person]+.4*np.array(color)).astype(np.uint8)
    writer.write(cv2.cvtColor(overlay,cv2.COLOR_RGB2BGR))
    small=cv2.resize(mask.astype(np.uint8),(640,272),interpolation=cv2.INTER_NEAREST)
    gray=cv2.resize(cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY),(640,272))
    row=dict(frame=frame,area=int(mask.sum()))
    if previous_gray is not None:
        flow=cv2.calcOpticalFlowFarneback(gray,previous_gray,None,.5,3,21,3,5,1.2,0)
        yy,xx=np.mgrid[:272,:640].astype(np.float32)
        warped=cv2.remap(previous_mask,xx+flow[:,:,0],yy+flow[:,:,1],cv2.INTER_NEAREST)>0
        current=small>0;row['warpedIoU']=float((warped&current).sum()/max(1,(warped|current).sum()))
    rows.append(row);previous_gray=gray;previous_mask=small
    if frame%64==0:sheet=Image.new('RGB',(2048,1664))
    cell=Image.fromarray(rgb*mask[:,:,None]).crop((350,24,1000,532)).resize((256,200))
    col=(frame%64)%8;r=(frame%64)//8
    sheet.paste(cell,(col*256,r*208+8));ImageDraw.Draw(sheet).text((col*256+2,r*208),str(frame),fill='white')
    if frame%64==63 or frame==580:sheet.save(f'.qa/all-frames-{frame//64:02d}.jpg',quality=94)
cap.release();writer.release()
ranked=sorted(rows[1:],key=lambda r:r['warpedIoU'])
Path('.qa/temporal-audit.json').write_text(json.dumps(dict(frames=len(rows),meanWarpedIoU=float(np.mean([r['warpedIoU'] for r in rows[1:]])),worst=ranked[:30],all=rows),indent=2))
print(json.dumps({'frames':len(rows),'worst':ranked[:10]},indent=2))
