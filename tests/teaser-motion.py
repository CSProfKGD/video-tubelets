import json,math
from pathlib import Path
frames=json.loads(Path('.qa/teaser/framing.json').read_text())
assert len(frames)==1920
assert all(f['margin']>0 for f in frames if f['bounds']>0)
assert all(f['margin']>=59.99 for f in frames if f['time']>=7.6)
end=[f for f in frames if 25.7<=f['time']<=31]
max_accel=0
for a,b,c in zip(end,end[1:],end[2:]):
 for p,q,r in zip(a['corners'],b['corners'],c['corners']):
  max_accel=max(max_accel,math.hypot(r[0]-2*q[0]+p[0],r[1]-2*q[1]+p[1]))
assert max_accel<.15, max_accel
report={'frames':len(frames),'croppedVisibleFrames':sum(f['margin']<=0 for f in frames if f['bounds']>0),'minimumMarginAfterPullback':min(f['margin'] for f in frames if f['time']>=7.6),'maxEndingCornerSecondDifferencePixels':max_accel}
Path('.qa/teaser/motion.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
