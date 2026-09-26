"""Guard source composition, identities and the reviewed hip-leak correction."""
from pathlib import Path
import numpy as np
from PIL import Image
for frame in range(581):
 labels=np.asarray(Image.open(f'.cache/masks/final/{frame:05d}-instances.png'))
 union=np.asarray(Image.open(f'.cache/masks/final/{frame:05d}.png'))
 assert labels.shape==union.shape==(544,1280)
 assert set(np.unique(labels))=={0,128,255},frame
 assert np.array_equal(labels>0,union>0),frame
 assert not union[:,:320].any() and not union[:,1000:].any(),frame
 assert np.where(labels==128)[1].mean()<np.where(labels==255)[1].mean(),frame
labels=np.asarray(Image.open('.cache/masks/final/00360-instances.png'))
for x,y in [(430,277),(411,320),(552,374),(593,455)]:assert labels[y,x]==0,(x,y)
for x,y in [(575,160),(520,240),(470,300),(515,400),(488,510),(553,481)]:assert labels[y,x]==128,(x,y)
assert np.asarray(Image.open('.cache/masks/final/00386-instances.png'))[277,430]==0
print('581 source masks: composition, coverage, identity ordering, and hip-leak regression pass.')
