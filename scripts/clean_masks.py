"""Conservative per-frame dust removal; preserve detached moving hands and feet."""
import cv2
import numpy as np

def clean_mask(mask):
    count,labels,stats,_=cv2.connectedComponentsWithStats((mask>0).astype(np.uint8),8)
    if count<=2:return mask.copy(),[]
    main=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]))
    distance=cv2.distanceTransform((labels!=main).astype(np.uint8),cv2.DIST_L2,5)
    result=mask.copy();removed=[]
    for label in range(1,count):
        if label==main:continue
        area=int(stats[label,cv2.CC_STAT_AREA]);gap=float(distance[labels==label].min())
        if area<=32 and gap>20:
            result[labels==label]=0
            removed.append({'area':area,'gap':gap,'box':stats[label,:4].tolist()})
    return result,removed

def fill_matching_pinholes(mask,rgb):
    """Fill only tiny enclosed holes whose source color matches their foreground rim."""
    count,labels,stats,_=cv2.connectedComponentsWithStats((mask==0).astype(np.uint8),8)
    result=mask.copy();filled=[];height,width=mask.shape
    for label in range(1,count):
        x,y,w,h,area=map(int,stats[label])
        if area>12 or x==0 or y==0 or x+w==width or y+h==height:continue
        hole=labels==label
        rim=(cv2.dilate(hole.astype(np.uint8),np.ones((3,3),np.uint8))>0)&(mask>0)
        if not rim.any():continue
        difference=float(np.linalg.norm(np.median(rgb[hole],axis=0)-np.median(rgb[rim],axis=0)))
        if difference<=18:
            result[hole]=255;filled.append({'area':area,'box':[x,y,w,h],'colorDifference':difference})
    return result,filled
