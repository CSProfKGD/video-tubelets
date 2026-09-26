"""Flag directional disagreements and motion-compensated changes for human review."""
import argparse,json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw
ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);args=ap.parse_args()
root=Path('.cache/masks');stats=[]
for idx in range(581):
    if not all((root/d/f'{idx:05d}-{obj}.png').exists() for d in ['forward','reverse'] for obj in range(2)):continue
    ious=[]
    for obj in range(2):
        a=np.array(Image.open(root/'forward'/f'{idx:05d}-{obj}.png'))>0
        b=np.array(Image.open(root/'reverse'/f'{idx:05d}-{obj}.png'))>0
        ious.append(float((a&b).sum()/max(1,(a|b).sum())))
    stats.append(dict(frame=idx,iou=ious))
ranked=sorted(stats,key=lambda r:min(r['iou']))
Path('.qa/directional-agreement.json').write_text(json.dumps(dict(frames=len(stats),meanIoU=np.mean([r['iou'] for r in stats],axis=0).tolist() if stats else [],worst=ranked,chronological=stats),indent=2))
cap=cv2.VideoCapture(args.source)
for part in range(6):
    subset=ranked[part*4:(part+1)*4]
    if not subset:continue
    sheet=Image.new('RGB',(1560,459*len(subset)))
    for row,item in enumerate(subset):
        idx=item['frame'];cap.set(cv2.CAP_PROP_POS_FRAMES,idx);ok,bgr=cap.read();assert ok
        rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
        for col,direction in enumerate(['source','forward','reverse']):
            arr=rgb.copy()
            if direction!='source':
                union=np.zeros((544,1280),bool)
                for obj in range(2):union|=np.array(Image.open(root/direction/f'{idx:05d}-{obj}.png'))>0
                arr*=union[:,:,None]
            sheet.paste(Image.fromarray(arr[:,350:1000]).resize((520,435)),(520*col,row*459+24))
        ImageDraw.Draw(sheet).text((8,row*459+5),f"Frame {idx} | source / forward / reverse | IoU {item['iou'][0]:.3f}, {item['iou'][1]:.3f}",fill='white')
    sheet.save(f'.qa/disagreement-{part}.jpg',quality=95)
print(json.dumps({'compared':len(stats),'worst':ranked[:5]},indent=2))
