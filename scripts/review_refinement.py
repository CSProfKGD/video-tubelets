"""Source-resolution refinement review; this does not modify segmentation data."""
import json
from pathlib import Path
import numpy as np,cv2
from PIL import Image,ImageDraw
root=Path('.cache/masks/refined-forward');qa=Path('.qa/refinement');qa.mkdir(exist_ok=True)
def readmask(frame,obj):
 base=np.array(Image.open(root/f'{frame:05d}-{obj}.png'))
 candidate=Path('.cache/masks/refined-hip')/f'{frame:05d}-{obj}.png'
 if obj==0 and frame!=386 and candidate.exists():
  correction=np.array(Image.open(candidate));base[245:340,400:500]=correction[245:340,400:500]
 return base
ids=sorted(int(p.stem.split('-')[0]) for p in root.glob('*-0.png'))
rows=[]
for frame in ids:
 rgb=np.array(Image.open(f'.cache/teaser/rgb/{frame:05d}.png'))
 masks=[readmask(frame,i)>0 for i in range(2)]
 old=np.array(Image.open(f'.cache/masks/final-before-refinement/{frame:05d}-instances.png'))
 assert all(m.any() for m in masks)
 assert np.where(masks[0])[1].mean()<np.where(masks[1])[1].mean(),frame
 union=masks[0]|masks[1]
 rows.append({'frame':frame,'iou':[float((m&(old==label)).sum()/(m|(old==label)).sum()) for m,label in zip(masks,[128,255])],'areas':[int(m.sum()) for m in masks]})
 if frame%64==0:sheet=Image.new('RGB',(2048,1664))
 cell=Image.fromarray(rgb*union[:,:,None]).crop((350,24,1000,532)).resize((256,200))
 col=frame%8;r=frame%64//8;sheet.paste(cell,(col*256,r*208+8));ImageDraw.Draw(sheet).text((col*256+2,r*208),str(frame),fill='white')
 if frame%64==63 or frame==ids[-1]:sheet.save(qa/f'all-{frame//64:02d}.jpg',quality=95)
for part,frames in enumerate([[0,100,130,230],[285,345,354,360],[368,400,480,536],[540,552,574,580]]):
 frames=[f for f in frames if f in ids]
 if not frames:continue
 sheet=Image.new('RGB',(1560,459*len(frames)))
 for row,frame in enumerate(frames):
  rgb=np.array(Image.open(f'.cache/teaser/rgb/{frame:05d}.png'))
  old=np.array(Image.open(f'.cache/masks/final-before-refinement/{frame:05d}-instances.png'))
  for col,mode in enumerate(['source','before','after']):
   a=rgb.copy()
   if mode!='source':
    for obj,label in enumerate([128,255]):
     m=(old==label).astype('uint8') if mode=='before' else (readmask(frame,obj)>0).astype('uint8')
     contours,_=cv2.findContours(m,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE);cv2.drawContours(a,contours,-1,[(99,230,222),(255,159,122)][obj],1)
   im=Image.fromarray(a).crop((350,0,1000,544)).resize((520,435));sheet.paste(im,(col*520,row*459+24))
  ImageDraw.Draw(sheet).text((4,row*459+4),f'{frame}: source / before / after',fill='white')
 sheet.save(qa/f'boundary-{part}.jpg',quality=96)
(qa/'comparison.json').write_text(json.dumps({'frames':len(ids),'byFrame':rows,'lowestAgreement':sorted(rows,key=lambda r:min(r['iou']))[:20]},indent=2))
print('Reviewed assets generated for',len(ids),'frames')
