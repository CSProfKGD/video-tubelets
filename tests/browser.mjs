import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

await fs.mkdir('.qa',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,recordVideo:{dir:'.qa/browser-video',size:{width:960,height:668}}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5177');
await page.waitForSelector('.is-ready',{timeout:120000});
assert.equal(await page.evaluate(()=>window.__volume.tier.width),800);
await page.waitForTimeout(1200);
await page.screenshot({path:'.qa/desktop.png'});
if(process.env.QUICK) {
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  await page.waitForTimeout(500);
  await page.screenshot({path:'.qa/enlarged-text.png'});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(()=>{
    const panel=document.querySelector('.controls').getBoundingClientRect();
    return [...document.querySelectorAll('.controls button')].every(e=>{
      const r=e.getBoundingClientRect(); return r.left>=panel.left && r.right<=panel.right && r.bottom<=panel.bottom;
    });
  }));
  await page.screenshot({path:'.qa/narrow-text.png',fullPage:true});
  console.log(JSON.stringify({errors,snapshot:await page.evaluate(()=>window.__volume.engine.snapshot())})); await browser.close(); process.exit(errors.length?1:0); }
const layoutChecks=[];
for(const [width,height] of [[1200,1028],[900,600],[600,510]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  const layout=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    return {viewport:[innerWidth,innerHeight],title:rect('h1'),slice:rect('#slice'),opacity:rect('#opacity'),stage:rect('.stage'),canvas:rect('canvas'),scrollY};
  });
  for(const name of ['title','slice','opacity']) assert.ok(layout[name].top>=0 && layout[name].bottom<=height,`${width}x${height}: ${name} must be visible`);
  assert.ok(Math.abs(layout.canvas.height-(layout.stage.height+layout.stage.top+layout.scrollY))<1);
  assert.ok(Math.abs(layout.canvas.top+layout.scrollY)<1);
  assert.ok(Math.abs(layout.canvas.width-width)<1);
  const framing=await page.evaluate(()=>{
    const e=window.__volume.engine,r=e.renderer.domElement.getBoundingClientRect(),panel=document.querySelector('.controls').getBoundingClientRect();
    const points=[];
    for(const x of [-.5,.5]) for(const y of [-.5,.5]) for(const z of [-.5,.5]){
      const p=e.size.clone().multiply({x,y,z}).project(e.camera);
      points.push({x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2});
    }
    return {points,top:e.host.getBoundingClientRect().top,panelTop:panel.top};
  });
  assert.ok(framing.points.every(p=>p.y>=framing.top && p.y<framing.panelTop-10 && p.x>=0 && p.x<=width),JSON.stringify(framing));
  layoutChecks.push(layout);
  await page.screenshot({path:`.qa/pane-${width}x${height}.png`});
}
await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(300);
await page.evaluate(()=>{const e=window.__volume.engine;e.camera.position.multiplyScalar(.7);e.controls.update();e.camera.rotateZ(.35);e.requestRender();});
await page.waitForTimeout(300);
await page.screenshot({path:'.qa/header-orbit.png'});
await page.getByRole('button',{name:'Reset',exact:true}).click();
await page.waitForFunction(()=>!window.__volume.engine.snapshot().resetting);
await page.waitForTimeout(250);
await fs.writeFile('.qa/layout-report.json',JSON.stringify(layoutChecks,null,2));
assert.equal(await page.locator('.slice-handle,.hint').count(),0);
assert.ok(await page.evaluate(()=>window.__volume.engine.scene.children.filter(o=>o.isLine || o.isLineSegments2).every(o=>o.material.depthTest)));
assert.ok(await page.evaluate(()=>{const labels=window.__volume.engine.scene.children.filter(o=>o.name.startsWith('face-label-'));return labels.length===0;}));
// Read all orthogonal slice families through the actual GPU texture and sampler.
const gpuSlices=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {fragment}=await import('/src/shaders.ts');
  const engine=window.__volume.engine, tier=window.__volume.tier;
  const results=[];
  const definitions=[['XY',tier.width,tier.height,tier.depth,'vec3(vWorld.xy,uCuts.z)']];
  for(const [plane,width,height,count,coordinate] of definitions) for(const index of [0,Math.floor(count/2),count-1]) {
    const cuts=new THREE.Vector3(1,1,1); cuts.setComponent(2,(count-index)/count);
    const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:'out vec3 vWorld; void main(){vWorld=vec3(uv,0.0);gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:fragment.split('void main()')[0]+`void main(){outColor=vec4(sampleAt(${coordinate}).rgb,1.0);}`,uniforms:{...engine.material.uniforms,uCuts:{value:cuts}}});
    const scene=new THREE.Scene(); const geometry=new THREE.PlaneGeometry(2,2); scene.add(new THREE.Mesh(geometry,material));
    const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false});
    engine.renderer.setRenderTarget(target); engine.renderer.render(scene,new THREE.Camera());
    const pixels=new Uint8Array(width*height*4); engine.renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    let binary=''; for(let i=0;i<pixels.length;i+=8192) binary+=String.fromCharCode(...pixels.subarray(i,i+8192));
    results.push({plane,index,width,height,data:btoa(binary)});
    geometry.dispose(); material.dispose(); target.dispose();
  }
  engine.renderer.setRenderTarget(null); engine.requestRender();
  return results;
});
for(const slice of gpuSlices) await fs.writeFile(`.qa/gpu-${slice.plane}-${slice.index}.rgba`,Buffer.from(slice.data,'base64'));
await fs.writeFile('.qa/gpu-slices.json',JSON.stringify(gpuSlices.map(({data,...meta})=>meta)));
// The nearly opaque ray-marched result must converge to the exact surface.
const endpointCheck=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const e=window.__volume.engine,original=e.state;
  const target=new THREE.WebGLRenderTarget(256,256);
  const samples=[];
  for(const opacity of [.9998,1]){
    e.update({...original,opacity});e.camera.updateMatrixWorld();
    e.material.uniforms.uViewProjection.value.multiplyMatrices(e.camera.projectionMatrix,e.camera.matrixWorldInverse);
    e.renderer.setRenderTarget(target);e.renderer.render(e.scene,e.camera);
    const bytes=new Uint8Array(256*256*4);e.renderer.readRenderTargetPixels(target,0,0,256,256,bytes);samples.push(bytes);
  }
  let maxDifference=0;
  for(let i=0;i<samples[0].length;i++) maxDifference=Math.max(maxDifference,Math.abs(samples[0][i]-samples[1][i]));
  e.renderer.setRenderTarget(null);target.dispose();e.update(original);
  return {maxDifference};
});
assert.ok(endpointCheck.maxDifference<=1,JSON.stringify(endpointCheck));
await fs.writeFile('.qa/opacity-endpoint.json',JSON.stringify(endpointCheck));
const snapshot=()=>page.evaluate(()=>window.__volume.engine.snapshot());
const reset=async()=>{
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.waitForFunction(()=>!window.__volume.engine.snapshot().resetting && window.__volume.getState().cuts.every(c=>c===1));
};
// Verify both opaque identity colors through the production GPU sampler.
const instanceChecks=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {fragment}=await import('/src/shaders.ts');
  const e=window.__volume.engine,tier=window.__volume.tier,results=[];
  for(const index of [0,180,359]) {
    const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:'out vec3 vWorld; void main(){vWorld=vec3(uv,0.0);gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:fragment.split('void main()')[0]+'void main(){outColor=sampleAt(vec3(vWorld.xy,uCuts.z));}',uniforms:{...e.material.uniforms,uInstanceColors:{value:1},uCuts:{value:new THREE.Vector3(1,1,1-index/tier.depth)}}});
    const scene=new THREE.Scene(),geometry=new THREE.PlaneGeometry(2,2);scene.add(new THREE.Mesh(geometry,material));
    const target=new THREE.WebGLRenderTarget(tier.width,tier.height,{depthBuffer:false});
    e.renderer.setRenderTarget(target);e.renderer.render(scene,new THREE.Camera());
    const pixels=new Uint8Array(tier.width*tier.height*4);e.renderer.readRenderTargetPixels(target,0,0,tier.width,tier.height,pixels);
    const labels=e.instances.image.data,volume=e.texture.image.data;let woman=0,man=0,maxError=0;
    for(let i=0;i<tier.width*tier.height;i++) {
      const voxel=index*tier.width*tier.height+i,label=labels[voxel];
      if(volume[voxel*4+3]!==255 || ![128,255].includes(label)) continue;
      const expected=label===128 ? [99,230,222,255] : [255,159,122,255];
      for(let c=0;c<4;c++) maxError=Math.max(maxError,Math.abs(pixels[i*4+c]-expected[c]));
      if(label===128)woman++;else man++;
    }
    results.push({index,woman,man,maxError});geometry.dispose();material.dispose();target.dispose();
  }
  e.renderer.setRenderTarget(null);e.requestRender();return results;
});
assert.ok(instanceChecks.every(r=>r.woman>1000 && r.man>1000 && r.maxError<=1),JSON.stringify(instanceChecks));
await fs.writeFile('.qa/instance-checks.json',JSON.stringify(instanceChecks,null,2));
assert.equal(await page.locator('h1').textContent(),'Video Tubelets');
assert.equal(await page.locator('.subtitle').textContent(),'Objects as Volumes in Space-Time');
await page.locator('#instance-colors').check();
await page.locator('#opacity').fill('0');
await page.locator('#emphasis').check();
await page.locator('#slice').fill('145.5');
await page.waitForTimeout(350);
assert.equal((await snapshot()).instanceColors,true);
await page.screenshot({path:'.qa/instance-colors.png'});
await reset();
assert.equal(await page.locator('#instance-colors').isChecked(),false);

assert.equal(await page.locator('.planes').count(),0);
assert.equal(await page.getByRole('checkbox',{name:'Slice only'}).isChecked(),false);
const handle=page.getByRole('slider',{name:'XY slice time'});
await handle.focus();
await page.keyboard.press('End');
assert.equal((await snapshot()).cuts[2],1/360);
await page.keyboard.press('Home');
await page.keyboard.press('Shift+ArrowRight');
assert.ok((await snapshot()).cuts[2]<1);
await reset();
assert.deepEqual((await snapshot()).cuts,[1,1,1]);
for(const opacity of [0,15,50,100]) {
  await page.locator('#opacity').fill(String(opacity));
  await page.waitForTimeout(700);
  assert.equal((await snapshot()).opacity,opacity/100);
  await page.screenshot({path:`.qa/opacity-${opacity}.png`});
}
// Cut-handle gestures never change the camera.
const before=await snapshot();
const box=await handle.boundingBox();
await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
await page.mouse.down();
await page.mouse.move(box.x+box.width*.25,box.y+box.height/2,{steps:15});
await page.mouse.up();
const after=await snapshot();
assert.ok(after.rotation.every((n,i)=>Math.abs(n-before.rotation[i])<1e-8));
assert.ok(after.camera.every((n,i)=>Math.abs((n-after.target[i])-(before.camera[i]-before.target[i]))<1e-8));
assert.notEqual(after.cuts[2],before.cuts[2]);
assert.deepEqual(after.camera,before.camera);
await page.screenshot({path:".qa/time-cut.png"});
// A cancelled gesture restores camera input without changing another cut.
const cancelBox=await handle.boundingBox();
await page.mouse.move(cancelBox.x+24,cancelBox.y+24); await page.mouse.down();
await handle.dispatchEvent('pointercancel',{pointerId:1}); await page.mouse.up();
assert.equal(await page.evaluate(()=>window.__volume.engine.controls.enabled),true);
await reset();
const stage=await page.locator('.stage').boundingBox();
await page.mouse.move(stage.x+stage.width*.3,stage.y+stage.height*.45);
await page.mouse.down();
await page.mouse.move(stage.x+stage.width*.65,stage.y+stage.height*.65,{steps:25});
await page.mouse.up();
await page.waitForTimeout(600);
assert.notDeepEqual((await snapshot()).camera,after.camera);
await page.screenshot({path:'.qa/orbit.png'});
// The original cube centre remains the fixed orbit pivot during time slicing.
await page.evaluate(()=>window.__volume.setState({cuts:[1,1,.4],plane:'XY',opacity:.2,emphasizeSlice:true,instanceColors:false}));
await page.waitForTimeout(100);
const pivot=await page.evaluate(()=>{
  const e=window.__volume.engine;
  return {target:e.controls.target.toArray(),expected:[0,0,0],ndc:e.controls.target.clone().project(e.camera).toArray(),expectedY:2*e.camera.view.offsetY/e.camera.view.fullHeight};
});
assert.ok(pivot.target.every((n,i)=>Math.abs(n-pivot.expected[i])<1e-10));
assert.ok(Math.abs(pivot.ndc[0])<1e-8 && Math.abs(pivot.ndc[1]-pivot.expectedY)<1e-8);
const resetAnimation=await page.evaluate(async()=>{
  const e=window.__volume.engine;
  const initial=e.snapshot();const start=performance.now();
  document.querySelector('.reset').click();
  const frames=[];
  while(e.snapshot().resetting){ await new Promise(requestAnimationFrame);frames.push({time:performance.now()-start,...e.snapshot()}); }
  return {initial,frames};
});
assert.ok(resetAnimation.frames.length>10);
const lastReset=resetAnimation.frames.at(-1);
assert.deepEqual(lastReset.cuts,[1,1,1]);assert.deepEqual(lastReset.target,[0,0,0]);
assert.deepEqual(lastReset.camera,[4,2.55,4.93]);
for(const frame of resetAnimation.frames){
  const t=Math.min(1,frame.time/700),ease=t*t*(3-2*t);
  const progress=(frame.cuts[2]-.4)/.6;
  assert.ok(Math.abs(progress-ease)<.055);
  assert.ok(Math.abs((frame.opacity-.2)/.8-progress)<1e-8);
  assert.deepEqual(frame.target,[0,0,0]);
}
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,n,i)=>sum+n*b[i],0))));
const fullAngle=angle(resetAnimation.initial.rotation,lastReset.rotation);
assert.ok(fullAngle>.01);
for(const frame of resetAnimation.frames){
  const progress=(frame.cuts[2]-.4)/.6;
  assert.ok(Math.abs(angle(frame.rotation,lastReset.rotation)/fullAngle-(1-progress))<.015);
}
await fs.writeFile('.qa/reset-animation.json',JSON.stringify(resetAnimation,null,2));
// New input interrupts the reset at its current pose, without a delayed jump.
await page.evaluate(()=>window.__volume.setState({cuts:[1,1,.4],plane:'XY',opacity:.2,emphasizeSlice:true,instanceColors:false}));
await page.waitForTimeout(50);
await page.getByRole('button',{name:'Reset',exact:true}).click();
await page.waitForTimeout(180);
await page.locator('#emphasis').check();
const interrupted=await snapshot();
assert.equal(interrupted.resetting,false);assert.ok(interrupted.cuts[2]>.4 && interrupted.cuts[2]<1);
await page.waitForTimeout(750);
assert.deepEqual((await snapshot()).cuts,interrupted.cuts);
await reset();
// Emphasis remains continuous at half-frame boundaries, including 100% background.
await page.locator('#emphasis').check();
await page.waitForTimeout(240);
assert.equal((await snapshot()).emphasis,1);
await handle.fill('145.25');
assert.ok(Math.abs((1-(await snapshot()).cuts[2])*360-145.25)<1e-8);
await page.locator('#opacity').fill('0');
await page.waitForTimeout(300);
await page.screenshot({path:'.qa/emphasis-dancers.png'});
const scrubBox=await handle.boundingBox(),scrubCamera=(await snapshot()).camera;
await page.mouse.move(scrubBox.x+scrubBox.width*.1,scrubBox.y+scrubBox.height/2);await page.mouse.down();
await page.mouse.move(scrubBox.x+scrubBox.width*.9,scrubBox.y+scrubBox.height/2,{steps:25});
await page.mouse.move(scrubBox.x+scrubBox.width*.2,scrubBox.y+scrubBox.height/2,{steps:25});await page.mouse.up();
assert.deepEqual((await snapshot()).camera,scrubCamera);
assert.equal((await snapshot()).emphasizeSlice,true);
await page.waitForTimeout(250);

const shaderChecks=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {fragment:legacy}=await import('/tests/reference-shaders.ts');
  const e=window.__volume.engine,original=e.state,material=e.material;
  const target=new THREE.WebGLRenderTarget(256,256);
  const render=()=>{
    e.camera.updateMatrixWorld();material.uniforms.uViewProjection.value.multiplyMatrices(e.camera.projectionMatrix,e.camera.matrixWorldInverse);
    e.renderer.setRenderTarget(target);e.renderer.render(e.scene,e.camera);
    const bytes=new Uint8Array(256*256*4);e.renderer.readRenderTargetPixels(target,0,0,256,256,bytes);return bytes;
  };
  const difference=(a,b)=>{let max=0,sum=0,changed=0;for(let i=0;i<a.length;i++)if(i%4!==3){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d;if(d)changed++;}return {max,mean:sum/(a.length*.75),changed};};
  const continuity=[];
  for(const opacity of [0,.15,1]) for(const index of [.5,80.5,180.5,358.5]) {
    const samples=[];
    for(const delta of [-.0001,.0001]) {
      e.update({...original,emphasizeSlice:true,opacity,cuts:[1,1,1-(index+delta)/360]});material.uniforms.uEmphasis.value=1;samples.push(render());
    }
    continuity.push({opacity,index,...difference(...samples)});
  }
  const volumeContinuity=[];
  const lines=e.scene.children.filter(o=>o.isLine || o.isLineSegments2);lines.forEach(o=>o.visible=false);
  for(const opacity of [0,.15,1]) for(const index of [.5,80.5,180.5,358.5]) {
    const samples=[];
    for(const delta of [-.0001,.0001]) {
      e.update({...original,emphasizeSlice:true,opacity,cuts:[1,1,1-(index+delta)/360]});material.uniforms.uEmphasis.value=1;samples.push(render());
    }
    volumeContinuity.push({opacity,index,...difference(...samples)});
  }
  lines.forEach(o=>o.visible=true);
  const focusedEndpoint=[];
  for(const opacity of [.9998,1]) {
    e.update({...original,emphasizeSlice:true,opacity,cuts:[1,1,.5]});material.uniforms.uEmphasis.value=1;focusedEndpoint.push(render());
  }
  const emphasisOpacityEndpoint=difference(...focusedEndpoint);
  e.update({...original,instanceColors:true,emphasizeSlice:false,opacity:0,cuts:[1,1,.5]});
  material.uniforms.uEmphasis.value=0;
  const qualitySamples=[];
  for(const steps of [240,640]) {material.uniforms.uSteps.value=steps;qualitySamples.push(render());}
  const instanceQuality=difference(...qualitySamples);
  // Compare original RGB rendering separately from corrected transparent depth.
  lines.forEach(o=>o.visible=false);
  const unchanged=[];const current=material.fragmentShader;
  for(const opacity of [1]) for(const cut of [1,.5,1/360]){
    e.update({...original,emphasizeSlice:false,opacity,cuts:[1,1,cut]});material.uniforms.uEmphasis.value=0;
    material.fragmentShader=current;material.needsUpdate=true;const a=render();
    material.fragmentShader=legacy;material.needsUpdate=true;const b=render();
    unchanged.push({opacity,cut,...difference(a,b)});
  }
  material.fragmentShader=current;material.needsUpdate=true;
  lines.forEach(o=>o.visible=true);
  e.renderer.setRenderTarget(null);target.dispose();e.update(original);e.requestRender();
  return {continuity,volumeContinuity,emphasisOpacityEndpoint,instanceQuality,unchanged};
});
assert.equal(shaderChecks.instanceQuality.max,0);
assert.ok(shaderChecks.unchanged.every(x=>x.max===0),JSON.stringify(shaderChecks.unchanged));
assert.ok(shaderChecks.continuity.every(x=>x.mean<.1),JSON.stringify(shaderChecks.continuity));
assert.ok(shaderChecks.volumeContinuity.every(x=>x.max<=3),JSON.stringify(shaderChecks.volumeContinuity));
assert.ok(shaderChecks.emphasisOpacityEndpoint.max<=2,JSON.stringify(shaderChecks.emphasisOpacityEndpoint));
await fs.writeFile('.qa/shader-checks.json',JSON.stringify(shaderChecks,null,2));
// Toggle transition can reverse from its current contribution without a jump.
const toggle=await page.evaluate(async()=>{
 const e=window.__volume.engine,samples=[];document.querySelector('#emphasis').click();
 for(let i=0;i<3;i++){await new Promise(requestAnimationFrame);samples.push(e.snapshot().emphasis);}
 document.querySelector('#emphasis').click();
 for(let i=0;i<15;i++){await new Promise(requestAnimationFrame);samples.push(e.snapshot().emphasis);}
 return samples;
});
assert.ok(toggle.every(v=>v===0 || v===1));
await reset();
// Measure presented animation-frame cadence with volume rendering during orbit.
const performanceResult=await page.evaluate(async()=>{
  const engine=window.__volume.engine;
  engine.update({...engine.state,opacity:.15}); engine.startInteraction();
  const stamps=[];
  for(let i=0;i<65;i++) { await new Promise(requestAnimationFrame); stamps.push(performance.now()); const offset=engine.camera.position.clone().sub(engine.controls.target).applyAxisAngle({x:0,y:1,z:0},.018); engine.camera.position.copy(engine.controls.target).add(offset); engine.camera.lookAt(engine.controls.target); engine.requestRender(); }
  engine.endInteraction();
  const durations=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b);
  return {medianFrameMs:durations[Math.floor(durations.length/2)],p95FrameMs:durations[Math.floor(durations.length*.95)],fps:1000/((stamps.at(-1)-stamps[0])/(stamps.length-1))};
});
await reset();
await page.emulateMedia({reducedMotion:'reduce'});
await page.evaluate(()=>document.documentElement.style.fontSize='200%');
await page.waitForTimeout(500);
await page.screenshot({path:'.qa/enlarged-text.png'});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
mobile.on('pageerror',e=>errors.push(e.message));
await mobile.goto('http://127.0.0.1:5177');
await mobile.waitForSelector('.is-ready',{timeout:120000});
await mobile.waitForTimeout(500);
assert.equal(await mobile.evaluate(()=>window.__volume.tier.width),400);
assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await mobile.screenshot({path:'.qa/mobile.png'});
await mobile.locator('#emphasis').tap();
await mobile.waitForTimeout(250);
assert.equal(await mobile.evaluate(()=>window.__volume.getState().plane),'XY');
assert.equal(await mobile.evaluate(()=>window.__volume.engine.controls.enableAnimations),false);
const touchHandle=await mobile.getByRole('slider',{name:'XY slice time'}).boundingBox();
const cdp=await mobile.context().newCDPSession(mobile);
const tx=touchHandle.x+touchHandle.width*.8,ty=touchHandle.y+touchHandle.height/2;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchHandle.x+touchHandle.width*.45,y:ty}]});
await mobile.waitForTimeout(100);
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
assert.ok((await mobile.evaluate(()=>window.__volume.getState().cuts))[2]<1);
assert.equal(await mobile.evaluate(()=>window.__volume.engine.controls.enabled),true);
await mobile.getByRole('button',{name:'Reset',exact:true}).tap();
assert.equal(await mobile.evaluate(()=>window.__volume.engine.snapshot().resetting),false);
assert.deepEqual(await mobile.evaluate(()=>window.__volume.getState().cuts),[1,1,1]);
await mobile.evaluate(()=>document.documentElement.style.fontSize='200%');
await mobile.waitForTimeout(500);
await mobile.screenshot({path:'.qa/mobile-enlarged.png',fullPage:true});
assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
const retina=await browser.newPage({viewport:{width:600,height:510},deviceScaleFactor:2});
await retina.goto('http://127.0.0.1:5177');await retina.waitForSelector('.is-ready',{timeout:120000});await retina.waitForTimeout(350);
assert.equal(await retina.evaluate(()=>window.__volume.tier.width),800);
assert.equal(await retina.evaluate(()=>window.__volume.engine.renderer.getPixelRatio()),2);
assert.ok(await retina.locator('#opacity').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
assert.ok(await retina.locator('#slice').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
await retina.screenshot({path:'.qa/pane-retina.png'});
await retina.setViewportSize({width:1100,height:900});
await retina.evaluate(()=>{const e=window.__volume.engine;e.camera.position.set(0,0,4.5);e.camera.up.set(0,1,0);e.controls.update();e.requestRender();});
await retina.waitForTimeout(400);
await retina.screenshot({path:'.qa/high-quality-closeup.png'});
await fs.writeFile('.qa/browser-report.json',JSON.stringify({errors,performance:performanceResult,desktop:await snapshot(),mobile:await mobile.evaluate(()=>window.__volume.engine.snapshot())},null,2));
console.log(JSON.stringify({errors,performance:performanceResult},null,2));
await browser.close();
assert.deepEqual(errors,[]);
