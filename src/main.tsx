import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { changeCut, fractionalTimeIndex, timestampAt, dimensions, initialState, keyboardCut, type Manifest, type Tier, type VolumeState } from './model';
import { VolumeScene } from './scene';
import './styles.css';

function App() {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state); stateRef.current = state;
  const [tier, setTier] = useState<Tier>();
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<VolumeScene | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let worker: Worker | undefined;
    let renderer: VolumeScene | undefined;
    setError(''); setReady(false); setProgress(0);
    async function load() {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) throw new Error('This view needs WebGL 2. Try a browser with hardware acceleration enabled.');
      const maximum = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      const base = new URL(`${import.meta.env.BASE_URL}volume/`, location.href).href;
      const response = await fetch(new URL('manifest.json', base), { cache: 'no-cache' });
      if (!response.ok) throw new Error('The video volume is unavailable. Check that preprocessing has completed, then retry.');
      const manifest: Manifest = await response.json();
      if (cancelled) return;
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      const compact = maximum < manifest.tiers.desktop.width || (matchMedia('(max-width: 720px) and (pointer: coarse)').matches) || (memory !== undefined && memory <= 4);
      const selected = manifest.tiers[compact ? 'compact' : 'desktop'];
      if (Math.max(selected.width, selected.height, selected.depth) > maximum) throw new Error('This device cannot hold the video volume. Try a device with a larger graphics memory limit.');
      setTier(selected);
      worker = new Worker(new URL('./loader.worker.ts', import.meta.url), { type: 'module' });
      worker.onerror = () => { if (!cancelled) setError('The video data could not be decoded. Please retry.'); worker?.terminate(); };
      worker.onmessage = ({ data }) => {
        if (cancelled) return;
        if (data.type === 'progress') setProgress(data.progress);
        if (data.type === 'error') { setError(data.message); worker?.terminate(); }
        if (data.type === 'ready') {
          try {
            renderer = new VolumeScene(host.current!, selected, data.buffer, data.instanceBuffer, stateRef.current, compact);
            renderer.onContextLost = () => { setReady(false); setError('The graphics connection was interrupted. Retry to restore the volume.'); };
            engine.current = renderer;
            setReady(true);
            if (import.meta.env.DEV) (window as unknown as { __volume: unknown }).__volume = { engine: renderer, tier: selected, setState, getState: () => stateRef.current };
          } catch (e) { setError(e instanceof Error ? e.message : 'Unable to display the volume.'); }
          worker?.terminate();
        }
      };
      worker.postMessage({ base, tier: selected });
    }
    load().catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; worker?.terminate(); renderer?.dispose(); engine.current = undefined; };
  }, [attempt]);

  useEffect(() => { engine.current?.update(state); }, [state]);
  useEffect(() => {
    const cancel = () => finishGesture();
    window.addEventListener('blur', cancel);
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange',visibility);
    return () => { window.removeEventListener('blur',cancel); document.removeEventListener('visibilitychange',visibility); };
  }, []);

  function finishGesture() {
    if (engine.current) { engine.current.controls.enabled = true; engine.current.endInteraction(); }
  }
  const count = tier?.depth ?? 360;
  const sliderValue = fractionalTimeIndex(state.cuts[2],count);
  const position = tier ? `${timestampAt(sliderValue,tier.timestamps).toFixed(1)} s` : '0.0 s';
  return <main className="site-shell">
    <header className="hero"><h1>Video Tubelets</h1><p className="subtitle">Objects as Volumes in Space-Time</p></header>
    <section className={`experiment ${ready ? 'is-ready' : ''}`} aria-label="Explore the video volume">
      <div className="stage" ref={host}>
        {!ready && <div className="loading" role={error ? 'alert' : 'status'}>{error ? <><p>{error}</p><button onClick={() => setAttempt(n=>n+1)}>Retry</button></> : <><span>Preparing the volume</span><div className="progress-track"><div style={{ width: `${progress*100}%` }}/></div><span className="progress-value">{Math.round(progress*100)}%</span></>}</div>}
      </div>
      <div className="controls" aria-label="Volume controls">
          <div className="slice-control">
            <label htmlFor="slice">Time</label>
            <input id="slice" className="slice-track" type="range" min={0} max={count-1} step="any" value={sliderValue} disabled={!ready} aria-label="XY slice time" aria-valuetext={position} style={{'--slider-progress':`${sliderValue/(count-1)*100}%`} as CSSProperties}
              onPointerDown={()=>{engine.current?.interrupt();engine.current?.startInteraction();}} onPointerUp={finishGesture} onPointerCancel={finishGesture}
              onChange={event=>{if(tier){engine.current?.startInteraction();setState(s=>changeCut(s,1-Number(event.target.value)/count,dimensions(tier)));engine.current?.endInteraction();}}}
              onKeyDown={event=>{if(tier && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();engine.current?.interrupt();setState(s=>keyboardCut(s,event.key,event.shiftKey,dimensions(tier)));}}}/>
            <output htmlFor="slice" aria-label={position}>{position}</output>
          </div>
        <div className="opacity-control"><label htmlFor="opacity">Opacity</label><input id="opacity" type="range" min="0" max="100" step="1" value={Math.round(state.opacity*100)} disabled={!ready} style={{ '--slider-progress': `${state.opacity*100}%` } as CSSProperties} onPointerDown={()=>{engine.current?.interrupt();engine.current?.startInteraction();}} onPointerUp={()=>engine.current?.endInteraction()} onPointerCancel={()=>engine.current?.endInteraction()} onChange={e=>{ engine.current?.startInteraction(); setState(s=>({...s,opacity:Number(e.target.value)/100})); engine.current?.endInteraction(); }}/><output htmlFor="opacity">{Math.round(state.opacity*100)}<span>%</span></output></div>
        <div className="control-dock"><div className="display-options"><label className="emphasis-control"><input id="emphasis" type="checkbox" checked={state.emphasizeSlice} disabled={!ready} onChange={event=>{engine.current?.interrupt();setState(s=>({...s,emphasizeSlice:event.target.checked}));}}/><span>Slice only</span></label>
          <label className="emphasis-control"><input id="instance-colors" type="checkbox" checked={state.instanceColors} disabled={!ready} onChange={event=>{engine.current?.interrupt();setState(s=>({...s,instanceColors:event.target.checked}));}}/><span>Instances</span></label></div>
          <button className="reset" disabled={!ready} onClick={()=>{ finishGesture(); engine.current?.reset(setState); }}>Reset</button></div>
      </div>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
