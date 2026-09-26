// Deterministic local export director. Does not alter the interactive application.
import * as THREE from '/node_modules/three/build/three.module.js';
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const ramp=(t,a,b)=>ease((t-a)/(b-a));
const cameraRamp=(t,a,b)=>{const x=clamp((t-a)/(b-a));return x*x*x*(x*(x*6-15)+10);};
// Integrated smoothstep velocity: gentle ramps with a constant-speed middle.
// A full quintic position ease otherwise accelerates throughout half the orbit.
const orbitRamp=(t,a,b)=>{
 const u=clamp((t-a)/(b-a)),edge=.2;
 const integral=x=>x*x*x/(edge*edge)-.5*x*x*x*x/(edge*edge*edge);
 return (u<edge?integral(u):u>1-edge?1-edge-integral(1-u):u-edge*.5)/(1-edge);
};
const mix=(a,b,t)=>a+(b-a)*t;
export async function initTeaser(width=1920,height=1080,profile='full') {
 const e=window.__volume.engine,tier=window.__volume.tier;
 const short=profile==='short'?await (await fetch('/scripts/teaser-short.json')).json():null;
 if(short){
  // Use an actual contiguous excerpt, including its matching volume and audio.
  const first=tier.sourceFrames.indexOf(short.sourceStartFrame),last=tier.sourceFrames.indexOf(short.sourceEndFrame);
  if(first<0||last<first)throw new Error('Excerpt endpoints must exist in the packaged volume.');
  const depth=last-first+1,pixels=tier.width*tier.height;
  for(const [texture,channels] of [[e.texture,4],[e.instances,1]]){
   texture.dispose();texture.image.data=texture.image.data.slice(first*pixels*channels,(last+1)*pixels*channels);texture.image.depth=depth;texture.needsUpdate=true;
  }
  tier.timestamps=tier.timestamps.slice(first,last+1);tier.sourceFrames=tier.sourceFrames.slice(first,last+1);tier.depth=depth;
  e.times.dispose();e.times.image.data=new Float32Array(tier.timestamps);e.times.image.width=depth;e.times.needsUpdate=true;
  e.material.uniforms.uCounts.value.z=depth;
 }
 e.observer.disconnect();e.controls.dispose();e.cancelReset();cancelAnimationFrame(e.frame);e.requestRender=()=>{};
 e.modeOverlay?.remove();e.modeOverlay=undefined;
 document.querySelector('.hero').style.display='none';document.querySelector('.controls').style.display='none';
 e.renderer.setPixelRatio(1);e.renderer.setSize(width,height,false);e.camera.clearViewOffset();e.camera.aspect=width/height;e.camera.fov=32;e.camera.updateProjectionMatrix();
 const volume=e.scene.children.find(o=>o.isMesh&&!o.isLineSegments2);
 const outlines=e.scene.children.filter(o=>o.isLineSegments2);
 const output=document.createElement('canvas');output.width=width;output.height=height;
 output.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:100;background:#000';document.body.append(output);
 const ctx=output.getContext('2d',{alpha:false});
 const material=new THREE.ShaderMaterial({vertexShader:'varying vec2 tex;void main(){tex=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
 varying vec2 tex;uniform sampler2D rgb;uniform sampler2D mask;uniform sampler2D identity;uniform float opacity;uniform float maskTint;
 vec3 linearize(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
 vec3 encode(vec3 c){return mix(12.92*c,1.055*pow(max(c,vec3(0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
 void main(){
  vec3 c=texture2D(rgb,tex).rgb;
  float rawCoverage=texture2D(mask,tex).r;
  float coverage=smoothstep(.15,.65,rawCoverage);
  float person=clamp((texture2D(identity,tex).r/max(rawCoverage,.0001)-128.0/255.0)/(127.0/255.0),0.0,1.0);
  vec3 palette=mix(vec3(99,230,222)/255.0,vec3(255,159,122)/255.0,person);
  vec3 tinted=mix(linearize(c),linearize(palette),maskTint*coverage);
  float a=mix(opacity,1.0,coverage);
  gl_FragColor=vec4(opacity==1.0&&maskTint==0.0?c:encode(tinted*a),1.0);
  gl_FragDepth=coverage>.02?gl_FragCoord.z:1.0;
 }`,
 uniforms:{rgb:{value:null},mask:{value:null},identity:{value:null},opacity:{value:1},maskTint:{value:0}},side:THREE.DoubleSide});
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(e.size.x,e.size.y),material);e.scene.add(plane);
 let currentFrame=-1;let textures=[];
 async function loadFrame(index){
  if(index===currentFrame)return;
  const images=await Promise.all([`/.cache/teaser/rgb/${String(index).padStart(5,'0')}.png`,`/.cache/masks/final/${String(index).padStart(5,'0')}.png`,`/.cache/masks/final/${String(index).padStart(5,'0')}-instances.png`].map(async url=>{const image=new Image();image.src=url;await image.decode();return image;}));
  textures.forEach(t=>t.dispose());textures=images.map(image=>{const t=new THREE.Texture(image);t.colorSpace=THREE.NoColorSpace;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;});
  material.uniforms.rgb.value=textures[0];material.uniforms.mask.value=textures[1];material.uniforms.identity.value=textures[2];currentFrame=index;
 }
 const sourceStart=short?short.sourceStartFrame*1001/24000:0;
 const last=short?(short.sourceEndFrame-short.sourceStartFrame)*1001/24000:580*1001/24000;
 const duration=short?last:581*1001/24000,rewindEnd=duration+(short?.rewindDuration??1.35);
 // Once the loop return starts, decay the settled framing offset itself.
 // Re-solving which corner limits the fit during a fast dolly adds a subtle zoom pulse.
 let loopFitOffset=0;
 if(short){
  const y=THREE.MathUtils.degToRad(44),p=THREE.MathUtils.degToRad(17);
  const n=new THREE.Vector3(Math.sin(y)*Math.cos(p),Math.sin(p),Math.cos(y)*Math.cos(p));
  const r=new THREE.Vector3(Math.cos(y),0,-Math.sin(y));
  const u=new THREE.Vector3(-Math.sin(y)*Math.sin(p),Math.cos(p),-Math.cos(y)*Math.sin(p));
  const values=[8.15],tan=Math.tan(THREE.MathUtils.degToRad(16));
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
   const v=e.size.clone().multiply(new THREE.Vector3(x,y,z));
   values.push(v.dot(n)+Math.abs(v.dot(r))/(tan*width/height*(1-120/width)),v.dot(n)+Math.abs(v.dot(u))/(tan*(1-120/height)));
  }
  const maximum=Math.max(...values);
  loopFitOffset=maximum+.035*Math.log(values.reduce((s,v)=>s+Math.exp((v-maximum)/.035),0))-8.15;
 }
 function draw(mode){
  plane.visible=mode==='slice';volume.visible=!plane.visible;
  e.material.uniforms.uInstanceColors.value=mode==='instances'?1:0;e.material.uniforms.uEmphasis.value=0;
  e.camera.updateMatrixWorld();e.material.uniforms.uViewProjection.value.multiplyMatrices(e.camera.projectionMatrix,e.camera.matrixWorldInverse);
  e.renderer.render(e.scene,e.camera);
 }
 window.teaserFrame=async (time,encode=true)=>{
  let sourceTime=Math.min(last,time);
  if(time>=duration)sourceTime=last*(1-ramp(time,duration,rewindEnd));
  if(time>=rewindEnd)sourceTime=0;
  const sourceIndex=Math.min(580,Math.max(0,Math.floor((sourceStart+sourceTime)*24000/1001+1e-6)));
  if(time<rewindEnd+1.05)await loadFrame(sourceIndex);
  const active=sourceTime/last*(tier.depth-1),cut=1-active/tier.depth;
  e.update({cuts:[1,1,cut],plane:'XY',opacity:0,emphasizeSlice:false,instanceColors:false});
  e.material.uniforms.uOpacity.value=0;e.material.uniforms.uEmphasis.value=0;
  plane.position.z=(cut-.5)*e.size.z;
  const pull=cameraRamp(time,...(short?.pullback??[1.35,7.6])),turn=orbitRamp(time,...(short?.middleOrbit??[8,duration-1.1])),final=orbitRamp(time,rewindEnd+.1,short?.finalOrbitEnd??30.7);
  const loop=short?cameraRamp(time,...short.loopReturn):0;
  const yaw=THREE.MathUtils.degToRad(mix(23*turn,44,final)*(1-loop));
  const pitch=THREE.MathUtils.degToRad(mix(8*turn,17,final)*(1-loop));
  const fit=(e.size.x/2)/(Math.tan(THREE.MathUtils.degToRad(16))*width/height);
  const radius=mix(mix(mix(fit+e.size.z*.5,6.35,pull),8.15,final),fit+e.size.z*.5,loop);
  const targetZ=mix(mix(plane.position.z*(1-pull),0,final),plane.position.z,loop);
  e.camera.position.set(Math.sin(yaw)*Math.cos(pitch)*radius,Math.sin(pitch)*radius,Math.cos(yaw)*Math.cos(pitch)*radius);
  e.camera.up.set(0,1,0);e.camera.lookAt(0,0,targetZ);e.camera.updateMatrixWorld();
  // Solve perspective framing continuously. A smooth maximum avoids both
  // discrete zoom steps and velocity kinks when a different corner limits fit.
  const target=new THREE.Vector3(0,0,targetZ);
  const direction=e.camera.position.clone().sub(target).normalize();
  const right=new THREE.Vector3().setFromMatrixColumn(e.camera.matrixWorld,0);
  const up=new THREE.Vector3().setFromMatrixColumn(e.camera.matrixWorld,1);
  const distance=e.camera.position.distanceTo(target);
  const tanY=Math.tan(THREE.MathUtils.degToRad(16));
  const constraints=[distance];
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
   const v=e.size.clone().multiply(new THREE.Vector3(x,y,z)).sub(target);
   constraints.push(v.dot(direction)+Math.abs(v.dot(right))/(tanY*width/height*(1-120/width)),
                    v.dot(direction)+Math.abs(v.dot(up))/(tanY*(1-120/height)));
  }
  const maximum=Math.max(...constraints),softness=.035;
  const fitted=maximum+softness*Math.log(constraints.reduce((sum,value)=>sum+Math.exp((value-maximum)/softness),0));
  const cameraDistance=short&&time>=short.loopReturn[0]?distance+loopFitOffset*(1-loop):mix(distance,fitted,cameraRamp(time,...(short?short.fitBlend:[5.7,7.6])));
  e.camera.position.copy(target).addScaledVector(direction,cameraDistance);e.camera.updateMatrixWorld();
  let margin=Infinity;
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
   const q=e.size.clone().multiply(new THREE.Vector3(x,y,z)).project(e.camera);
   margin=Math.min(margin,(1-Math.abs(q.x))*width/2,(1-Math.abs(q.y))*height/2);
  }
  // The opening may fill the screen, but bounds cannot appear until safely inside it.
  const bounds=ramp(time,...(short?short.boundsFade:[2.5,5.7]))*ease((margin-12)/48)*(1-loop);
  const corners=[];
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
   const q=e.size.clone().multiply(new THREE.Vector3(x,y,z)).project(e.camera);
   corners.push([(q.x+1)*width/2,(1-q.y)*height/2]);
  }
  (window.teaserAudit??=[]).push({time,margin,bounds,cameraDistance,corners,cut,yaw,pitch,sourceIndex});
  for(const line of outlines)line.material.opacity=(line===e.highlight ? (short?.82:.7) : (short?.64:.48))*bounds;
  material.uniforms.opacity.value=short&&time>=short.loopReturn[0]?ramp(time,...short.loopBackground):1-ramp(time,...(short?.backgroundDissolve??[3,7.1]));
  // Briefly identify the dancers, retaining clothing detail. The tint then
  // shares the background's exact fade envelope and disappears with it.
  material.uniforms.maskTint.value=time<duration?.55*ramp(time,...(short?.maskFadeIn??[1.55,2.5]))*material.uniforms.opacity.value:0;
  ctx.globalAlpha=1;
  if(short&&time>=short.loopReturn[0]){
   const slice=ramp(time,...short.loopSlice);
   draw('instances');ctx.drawImage(e.renderer.domElement,0,0);
   draw('slice');ctx.globalAlpha=slice;ctx.drawImage(e.renderer.domElement,0,0);
  }
  else if(time<duration){draw('slice');ctx.drawImage(e.renderer.domElement,0,0);}
  else {
   // The backward-moving cut progressively retains every later frame. Ease
   // into volume rendering at the start of rewind, never reveal it all at once.
   const reveal=ramp(time,duration,duration+.24),color=ramp(time,...(short?.instanceColors??[28.15,29.35]));
   if(reveal<1){draw('slice');ctx.drawImage(e.renderer.domElement,0,0);draw('rgb');ctx.globalAlpha=reveal;ctx.drawImage(e.renderer.domElement,0,0);}
   else if(color<1){draw('rgb');ctx.drawImage(e.renderer.domElement,0,0);if(color>0){draw('instances');ctx.globalAlpha=color;ctx.drawImage(e.renderer.domElement,0,0);}}
   else {draw('instances');ctx.drawImage(e.renderer.domElement,0,0);}
  }
  ctx.globalAlpha=1;
  return encode?output.toDataURL('image/png').split(',')[1]:{time,sourceIndex,sourceTime};
 };
 return {width,height,duration,rewindEnd};
}
