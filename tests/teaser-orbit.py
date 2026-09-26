"""Check that orbit velocity settles to a steady plateau instead of surging."""
import json, math
from pathlib import Path
config=json.loads(Path('scripts/teaser-short.json').read_text())
for profile,windows in [('teaser-short',[config['middleOrbit'],(config['sourceEndFrame']*1001/24000+config['rewindDuration']+.1,config['finalOrbitEnd'])]),('teaser',[(8,23.1325416667),(25.6825416667,30.7)])]:
 frames=json.loads(Path(f'.qa/{profile}/framing.json').read_text())
 for start,end in windows:
  middle=[f for f in frames if start+.25*(end-start)<f['time']<start+.75*(end-start)]
  speeds=[(b['yaw']-a['yaw'])/(b['time']-a['time']) for a,b in zip(middle,middle[1:])]
  assert min(speeds)>0
  assert max(speeds)-min(speeds)<1e-8,(profile,speeds)
 print(profile,': both orbit phases have steady middle angular velocity')
