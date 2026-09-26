"""Audit the rendered short edit's framing, smooth motion, and loop geometry."""
import json,math
from pathlib import Path
c=json.loads(Path('scripts/teaser-short.json').read_text())
a=json.loads(Path('.qa/teaser-short/framing.json').read_text())
assert len(a)==c['outputDuration']*60
assert all(f['margin']>0 for f in a if f['bounds']>0)
assert all(f['margin']>=59.99 for f in a if c['pullback'][1]<=f['time']<c['loopReturn'][0])
start,last=a[0],a[-1]
loop_error=max(math.dist(p,q) for p,q in zip(start['corners'],last['corners']))
assert loop_error<.02,loop_error
end=[f for f in a if f['time']>=c['sourceEndFrame']*1001/24000+c['rewindDuration']]
accel=max(math.dist([r[0]-q[0],r[1]-q[1]],[q[0]-p[0],q[1]-p[1]]) for x,y,z in zip(end,end[1:],end[2:]) for p,q,r in zip(x['corners'],y['corners'],z['corners']))
assert accel<.3,accel
rewind_start=(c['sourceEndFrame']-c['sourceStartFrame'])*1001/24000
sweep=[f['cut'] for f in a if rewind_start<=f['time']<=rewind_start+c['rewindDuration']]
assert all(x<=y for x,y in zip(sweep,sweep[1:]))
r={'frames':len(a),'croppedVisibleFrames':0,'loopCornerDifferencePixels':loop_error,'maxCornerSecondDifferencePixels':accel,'progressiveRewind':True}
Path('.qa/teaser-short/motion.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
