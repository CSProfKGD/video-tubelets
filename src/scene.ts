import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { ArcballControls } from 'three/addons/controls/ArcballControls.js';
import { fragment, vertex } from './shaders';
import { dimensions, easeInOut, initialState, planeAxis, fractionalTimeIndex, timestampAt, type Bounds, type Tier, type VolumeState } from './model';

// A one-pixel analytical coverage fringe, independent of MSAA sample quantization.
// Expanded geometry leaves room for the full smooth edge even at shallow angles.
function outlineMaterial(color: number, opacity: number, width: number) {
  const material=new LineMaterial({color,opacity,linewidth:width+2,transparent:true,depthTest:true,depthWrite:false});
  material.fragmentShader=material.fragmentShader.replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );',
    `alpha *= 1.0-smoothstep(${(width/2-.5).toFixed(3)},${(width/2+.5).toFixed(3)},abs(vUv.x)*${((width+2)/2).toFixed(3)});\n gl_FragColor = vec4(diffuseColor.rgb,alpha);`);
  return material;
}

// Public in Three.js; omitted from the matching DefinitelyTyped declaration.
type CenteredArcball = ArcballControls & { target: THREE.Vector3 };

export class VolumeScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 1, .05, 100);
  controls: CenteredArcball;
  readonly size = new THREE.Vector3(1280 / 544 * 2, 2, 2.6);
  readonly material: THREE.ShaderMaterial;
  readonly instances: THREE.Data3DTexture;
  readonly texture: THREE.Data3DTexture;
  readonly highlight: LineSegments2;
  readonly observer: ResizeObserver;
  readonly times: THREE.DataTexture;
  private emphasisFrom = 0;
  private emphasisTarget = 0;
  private emphasisStart = 0;
  private emphasisDuration = 0;
  state: VolumeState;
  active = false;
  private frame = 0;
  private settle = 0;
  private disposed = false;
  private modeOverlay?: HTMLCanvasElement;
  private modeStart = 0;
  private readonly modeDuration = 240;
  private timings: number[] = [];
  private resetFrame = 0;
  private readonly initialPosition = new THREE.Vector3(4,2.55,4.93);
  private readonly initialRotation = new THREE.Quaternion();
  onContextLost?: () => void;

  constructor(readonly host: HTMLElement, readonly tier: Tier, buffer: ArrayBuffer, instanceBuffer: ArrayBuffer, state: VolumeState, readonly compact: boolean) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000);
    this.renderer.domElement.setAttribute('aria-label', 'Video volume: drag to orbit, scroll to zoom. Use the slice scrubber below to cut.');
    this.renderer.domElement.setAttribute('role', 'img');
    host.prepend(this.renderer.domElement);
    this.camera.position.copy(this.initialPosition);
    this.camera.lookAt(0, 0, 0);
    this.initialRotation.copy(this.camera.quaternion);
    this.controls = this.createControls();

    this.texture = new THREE.Data3DTexture(new Uint8Array(buffer), tier.width, tier.height, tier.depth);
    this.texture.format = THREE.RGBAFormat;
    this.texture.type = THREE.UnsignedByteType;
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.unpackAlignment = 1;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
    this.instances = new THREE.Data3DTexture(new Uint8Array(instanceBuffer), tier.width, tier.height, tier.depth);
    this.instances.format = THREE.RedFormat;
    this.instances.type = THREE.UnsignedByteType;
    this.instances.minFilter = this.instances.magFilter = THREE.LinearFilter;
    this.instances.unpackAlignment = 1;
    this.instances.needsUpdate = true;
    this.times = new THREE.DataTexture(new Float32Array(tier.timestamps),tier.depth,1,THREE.RedFormat,THREE.FloatType);
    this.times.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: fragment,
      uniforms: { uInstanceLighting: {value:1}, uInstances: {value:this.instances}, uInstanceColors: {value:state.instanceColors ? 1 : 0}, uTimes: {value:this.times}, uActiveTime: {value:0}, uEmphasis: {value:0}, uVolume: { value: this.texture }, uSize: { value: this.size }, uCounts: { value: new THREE.Vector3(...dimensions(tier)) }, uCuts: { value: new THREE.Vector3(...state.cuts) }, uOpacity: { value: state.opacity }, uSteps: { value: compact ? 420 : 640 }, uViewProjection: {value:new THREE.Matrix4()} },
      side: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...this.size.toArray()), this.material);
    this.scene.add(mesh);
    const edges=new THREE.EdgesGeometry(mesh.geometry);
    const outline = new LineSegments2(new LineSegmentsGeometry().setPositions(edges.attributes.position.array as Float32Array), outlineMaterial(0x9aaeb7,.48,1.25));
    edges.dispose();
    outline.name='volume-outline';
    outline.renderOrder = 2;
    this.scene.add(outline);
    this.highlight = new LineSegments2(new LineSegmentsGeometry(), outlineMaterial(0x63e6de,.7,1.4));
    this.highlight.name='slice-outline';
    this.highlight.renderOrder = 3;
    this.scene.add(this.highlight);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    const panel=host.parentElement?.querySelector(".controls");
    if(panel) this.observer.observe(panel);
    this.update(state);
    this.resize();
  }

  private contextLost = (event: Event) => { event.preventDefault(); this.onContextLost?.(); };
  private center() { return new THREE.Vector3(); }
  private createControls() {
    // The control's local up basis stays canonical; restore the current roll afterwards.
    const rotation=this.camera.quaternion.clone();
    this.camera.up.set(0,1,0);
    const controls=new ArcballControls(this.camera,this.renderer.domElement,this.scene) as CenteredArcball;
    controls.target.copy(this.center());
    this.camera.quaternion.copy(rotation);
    this.camera.up.set(0,1,0).applyQuaternion(rotation);
    controls.setGizmosVisible(false);
    controls.enablePan=false; controls.enableFocus=false;
    controls.cursorZoom=false;
    controls.enableAnimations=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.minDistance=4.1; controls.maxDistance=13;
    controls.update(); this.camera.updateMatrixWorld();
    controls.addEventListener('change',this.requestRender);
    controls.addEventListener('start',this.startInteraction);
    controls.addEventListener('end',this.endInteraction);
    return controls;
  }
  interrupt() {
    this.cancelReset();
    // Disposal cancels any running Arcball inertia through the public API.
    this.controls.dispose();
    this.controls=this.createControls();
  }
  private resize = () => {
    const frame=this.host.getBoundingClientRect();
    const top=frame.top+window.scrollY;
    const width=document.documentElement.clientWidth,height=frame.height+top;
    const canvas=this.renderer.domElement;
    canvas.style.setProperty('--canvas-top',`${top}px`);
    canvas.style.setProperty('--canvas-left',`${frame.left}px`);
    canvas.style.setProperty('--canvas-width',`${width}px`);
    canvas.style.setProperty('--canvas-height',`${height}px`);
    const panel=this.host.parentElement?.querySelector('.controls')?.getBoundingClientRect();
    const rootFont=parseFloat(getComputedStyle(document.documentElement).fontSize);
    // At enlarged text sizes, allow vertical scrolling instead of crowding the title.
    if(this.host.parentElement) this.host.parentElement.style.minHeight=rootFont>20 ? `${(panel?.height ?? 0)+60+rootFont*5}px` : '';
    // Frame above the dock, while retaining a full canvas underneath the glass.
    const clearHeight=Math.max(80, (panel ? panel.top-frame.top : frame.height)-20);
    const offsetY=(height-clearHeight)/2-top+clearHeight*.055;
    // Fit the wider source using the original pose, independent of the current orbit/cut.
    // This changes projection only; resizing and slicing never move the camera or pivot.
    const framingCamera=this.camera.clone();
    framingCamera.position.copy(this.initialPosition);
    framingCamera.quaternion.copy(this.initialRotation);
    framingCamera.updateMatrixWorld();
    let baseFov=frame.width/clearHeight<1 ? 48 : 34;
    for(;baseFov<80;baseFov+=.5) {
      framingCamera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov/2))*height/clearHeight));
      framingCamera.setViewOffset(width,height,0,offsetY,width,height);
      framingCamera.updateProjectionMatrix();
      let fits=true;
      for(const x of [-.5,.5]) for(const y of [-.5,.5]) for(const z of [-.5,.5]) {
        const p=this.size.clone().multiply(new THREE.Vector3(x,y,z)).project(framingCamera);
        const px=(p.x+1)*width/2,py=(1-p.y)*height/2;
        fits &&= px>=20 && px<=width-20 && py>=top+8 && py<=top+clearHeight;
      }
      if(fits) break;
    }
    this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov/2))*height/clearHeight));
    this.camera.setViewOffset(width,height,0,offsetY,width,height);
    this.camera.updateProjectionMatrix();
    // Keep outline coverage and stroke width identical during and after gestures.
    // Interaction quality adapts ray steps, never the shared framebuffer resolution.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // CSS owns layout; framebuffer dimensions must never enlarge the stage.
    this.renderer.setSize(width, height, false);
    this.requestRender();
  };
  startInteraction = () => {
    this.cancelReset();
    window.clearTimeout(this.settle);
    if (!this.active) { this.active = true; this.material.uniforms.uSteps.value = this.compact ? 240 : 320; this.resize(); }
  };
  endInteraction = () => {
    window.clearTimeout(this.settle);
    this.settle = window.setTimeout(() => { this.active = false; this.material.uniforms.uSteps.value = this.compact ? 420 : 640; this.resize(); }, 180);
  };
  requestRender = () => {
    if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(this.render);
  };
  private emphasisValue(now: number) {
    const progress=this.emphasisDuration===0 ? 1 : Math.min(1,(now-this.emphasisStart)/this.emphasisDuration);
    return this.emphasisFrom+(this.emphasisTarget-this.emphasisFrom)*easeInOut(progress);
  }
  private modeOpacity(now: number) {
    return 1-easeInOut(Math.min(1,(now-this.modeStart)/this.modeDuration));
  }
  private beginModeTransition() {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.modeOverlay?.remove(); this.modeOverlay=undefined; return;
    }
    // GPU-only validation renders do not need a presentation-layer transition.
    if(this.renderer.getRenderTarget()) return;
    this.camera.updateMatrixWorld();
    this.material.uniforms.uViewProjection.value.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
    this.renderer.render(this.scene,this.camera);
    const source=this.renderer.domElement;
    const overlay=document.createElement('canvas');
    overlay.width=source.width; overlay.height=source.height;
    overlay.className='mode-transition'; overlay.setAttribute('aria-hidden','true');
    overlay.style.cssText=source.style.cssText;
    const context=overlay.getContext('2d')!;
    context.drawImage(source,0,0);
    // Retoggling starts from the composite actually on screen, not a stale mode.
    if(this.modeOverlay) {
      context.globalAlpha=Number(this.modeOverlay.style.opacity || 1);
      context.drawImage(this.modeOverlay,0,0,overlay.width,overlay.height);
      this.modeOverlay.remove();
    }
    overlay.style.opacity='1';
    this.modeOverlay=overlay; this.modeStart=performance.now();
    this.host.append(overlay);
  }
  private render = () => {
    this.frame = 0;
    const start = performance.now();
    this.material.uniforms.uEmphasis.value=this.emphasisValue(start);
    if(start<this.emphasisStart+this.emphasisDuration) this.requestRender();
    this.camera.updateMatrixWorld();
    this.material.uniforms.uViewProjection.value.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
    this.renderer.render(this.scene, this.camera);
    if(this.modeOverlay) {
      const opacity=this.modeOpacity(performance.now());
      this.modeOverlay.style.opacity=String(opacity);
      if(opacity>0) this.requestRender();
      else {this.modeOverlay.remove();this.modeOverlay=undefined;}
    }
    this.timings.push(performance.now() - start);
    if (this.timings.length > 120) this.timings.shift();
  };
  update(state: VolumeState) {
    if(state.emphasizeSlice!==this.state.emphasizeSlice || state.instanceColors!==this.state.instanceColors) this.beginModeTransition();
    const target=state.emphasizeSlice ? 1 : 0;
    if(target!==this.emphasisTarget) {
      this.emphasisFrom=this.emphasisValue(performance.now());
      this.emphasisTarget=target; this.emphasisStart=performance.now();
      this.emphasisDuration=0;
    }
    const colorsChanged=this.state.instanceColors!==state.instanceColors;
    this.state = state;
    if(colorsChanged) this.resize();
    if(this.material) this.material.uniforms.uInstanceColors.value=state.instanceColors ? 1 : 0;
    this.material.uniforms.uActiveTime.value=timestampAt(fractionalTimeIndex(state.cuts[2],this.tier.depth),this.tier.timestamps);
    this.material.uniforms.uCuts.value.set(...state.cuts);
    this.material.uniforms.uOpacity.value = state.opacity;
    const axis = planeAxis(state.plane);
    const other = [0, 1, 2].filter(n => n !== axis);
    const points = [[0,0],[1,0],[1,1],[0,1]].map(pair => {
      const p = new THREE.Vector3();
      p.setComponent(axis, state.cuts[axis]);
      other.forEach((a, i) => p.setComponent(a, pair[i] * state.cuts[a]));
      return p.subScalar(.5).multiply(this.size);
    });
    this.highlight.geometry.dispose();
    this.highlight.geometry = new LineSegmentsGeometry().setPositions(points.flatMap((p,i)=>[...p.toArray(),...points[(i+1)%4].toArray()]));
    this.requestRender();
  }
  cancelReset() { cancelAnimationFrame(this.resetFrame); this.resetFrame=0; }
  reset(emit: (state: VolumeState)=>void) {
    this.interrupt();
    this.startInteraction();
    const from={...this.state,cuts:[...this.state.cuts] as Bounds};
    const rotation=this.camera.quaternion.clone();
    const distance=this.camera.position.distanceTo(this.controls.target);
    const start=performance.now();
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;
    const tick=(now: number)=>{
      const progress=duration===0 ? 1 : Math.min(1,(now-start)/duration);
      const amount=easeInOut(progress);
      const next: VolumeState={plane:'XY',emphasizeSlice:false,instanceColors:false,cuts:from.cuts.map(c=>c+(1-c)*amount) as Bounds,opacity:from.opacity+(1-from.opacity)*amount};
      this.update(next);
      const q=rotation.clone().slerp(this.initialRotation,amount);
      const radius=THREE.MathUtils.lerp(distance,this.initialPosition.length(),amount);
      this.camera.position.set(0,0,radius).applyQuaternion(q).add(this.controls.target);
      this.camera.up.set(0,1,0).applyQuaternion(q);
      if(progress===1) { this.camera.position.copy(this.initialPosition);this.camera.up.set(0,1,0); }
      this.controls.update(); this.camera.updateMatrixWorld();
      emit(progress===1 ? initialState() : next);
      this.requestRender();
      if(progress<1) this.resetFrame=requestAnimationFrame(tick);
      else { this.resetFrame=0;this.endInteraction(); }
    };
    if(duration===0) tick(start); else this.resetFrame=requestAnimationFrame(tick);
  }
  snapshot() { return { modeTransition:this.modeOverlay ? Number(this.modeOverlay.style.opacity) : 0, camera: this.camera.position.toArray(), rotation:this.camera.quaternion.toArray(), target:this.controls.target.toArray(), up: this.camera.up.toArray(), instanceColors:this.state.instanceColors, emphasizeSlice:this.state.emphasizeSlice, emphasis:this.material.uniforms.uEmphasis.value, cuts: this.state.cuts, opacity: this.state.opacity, resetting:this.resetFrame!==0, active: this.active, cpuRenderMs: this.timings.reduce((a,b)=>a+b,0)/Math.max(1,this.timings.length), renderer: this.renderer.info.render }; }
  dispose() {
    this.disposed = true;
    this.modeOverlay?.remove();this.modeOverlay=undefined;
    this.cancelReset();
    cancelAnimationFrame(this.frame); window.clearTimeout(this.settle);
    this.observer.disconnect(); this.controls.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(m => m.dispose());
      }
    });
    this.instances.dispose();
    this.times.dispose();
    this.texture.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
