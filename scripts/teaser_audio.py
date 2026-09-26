"""Source-only soundtrack: forward, time-curve-matched rewind, forward outro."""
import json,wave,sys
from pathlib import Path
import numpy as np
with wave.open('.cache/teaser/source-audio.wav','rb') as f:
    rate=f.getframerate();assert rate==48000 and f.getnchannels()==2 and f.getsampwidth()==2
    source=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,2).astype(np.float64)/32768
short='--short' in sys.argv
config=json.loads(Path('scripts/teaser-short.json').read_text()) if short else None
source_start=config['sourceStartFrame']*1001/24000 if short else 0
last=(config['sourceEndFrame']-config['sourceStartFrame'])*1001/24000 if short else 580*1001/24000
end=last if short else 581*1001/24000
rewind=config['rewindDuration'] if short else 1.35;resume=end+rewind
duration=config['outputDuration'] if short else 32
clock=np.arange(duration*rate)/rate
position=source_start+clock.copy()
back=(clock>=end)&(clock<resume)
u=(clock[back]-end)/rewind
position[back]=source_start+last*(1-u*u*(3-2*u))
position[clock>=resume]=source_start+clock[clock>=resume]-resume
samples=np.clip(position*rate,0,len(source)-1)
lo=np.floor(samples).astype(int);hi=np.minimum(lo+1,len(source)-1);fraction=(samples-lo)[:,None]
out=source[lo]*(1-fraction)+source[hi]*fraction
# Rate-dependent antialias filtering: this is still only the original waveform.
# Avoid digital foldover as the sweep briefly accelerates to roughly 27x.
speed=last*6*u*(1-u)/rewind
cutoff=np.minimum(24000,22000/np.maximum(speed,1))
band=np.clip(np.log2(cutoff/750),0,5)
spectrum=np.fft.rfft(source,axis=0);frequencies=np.fft.rfftfreq(len(source),1/rate)
rewound=np.zeros((back.sum(),2))
for index,limit in enumerate([750,1500,3000,6000,12000,24000]):
    window=np.clip((limit-frequencies)/(limit*.2),0,1)
    window=.5-.5*np.cos(np.pi*window)
    filtered=np.fft.irfft(spectrum*window[:,None],n=len(source),axis=0)
    sampled=filtered[lo[back]]*(1-fraction[back])+filtered[hi[back]]*fraction[back]
    weight=np.maximum(0,1-np.abs(band-index))
    rewound+=sampled*weight[:,None]
out[back]=rewound
# Tiny boundary fades suppress waveform clicks; no added sound effects.
for boundary in [end,resume]:
    distance=np.abs(clock-boundary)
    out*=np.minimum(1,distance/.004)[:,None]
if short and source_start>=.20:
    # Meet the original song at the exact opening sample when the clip loops.
    tail=clock>duration-.20
    match=(source_start-(duration-clock[tail]))*rate
    low=np.floor(match).astype(int);fractional=(match-low)[:,None]
    incoming=source[low]*(1-fractional)+source[low+1]*fractional
    weight=np.clip((clock[tail]-(duration-.20))/.20,0,1);weight=weight*weight*(3-2*weight)
    out[tail]=out[tail]*(1-weight[:,None])+incoming*weight[:,None]
elif short:
    # There is no audio before source time zero. Fade the outro without wrapping
    # negative indices into unrelated audio at the end of the source file.
    weight=np.clip((duration-clock)/.20,0,1)
    out*=(weight*weight*(3-2*weight))[:,None]
else:out*=np.clip((duration-clock)/.55,0,1)[:,None]
with wave.open('exports/teaser-short-audio.wav' if short else 'exports/teaser-audio.wav','wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate);f.writeframes((np.clip(out,-1,1)*32767).astype('<i2').tobytes())
report={'sampleRate':rate,'duration':duration,'sourceStart':source_start,'sourceEnd':source_start+last,'originalAudioUntil':end,'rewindDuration':rewind,'rewindCurve':'sourceTime=sourceStart+excerptLength*(1-smoothstep(u)); identical to video','resumeOriginalAt':resume,'peak':float(np.abs(out).max()),'syntheticSoundEffects':False,'outro':('original song resumes from beginning; last 200ms fades to silence before original opening restarts' if source_start==0 else 'original song resumes from excerpt start; last 200ms crossfades to pre-opening audio for loop') if short else 'original song resumes from beginning, last 550ms fades'}
qa=Path('.qa/teaser-short' if short else '.qa/teaser');qa.mkdir(parents=True,exist_ok=True)
(qa/'audio.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
