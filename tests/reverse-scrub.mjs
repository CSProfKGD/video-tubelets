import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const b=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:1100,height:850},recordVideo:{dir:'.qa/reverse-video'}});await p.goto('http://127.0.0.1:5177');await p.waitForSelector('.is-ready',{timeout:120000});
if(process.env.INSTANCES) await p.locator('#instance-colors').check();
const report=await p.evaluate(async()=>{
 const THREE=await import('/node_modules/three/build/three.module.js');const e=window.__volume.engine,original=e.state,t=new THREE.WebGLRenderTarget(400,300),lines=e.scene.children.filter(o=>o.isLineSegments2);lines.forEach(o=>o.visible=false);
 const render=(index,steps)=>{e.update({...original,opacity:0,cuts:[1,1,1-index/360]});e.material.uniforms.uSteps.value=steps;e.camera.updateMatrixWorld();e.material.uniforms.uViewProjection.value.multiplyMatrices(e.camera.projectionMatrix,e.camera.matrixWorldInverse);e.renderer.setRenderTarget(t);e.renderer.render(e.scene,e.camera);const a=new Uint8Array(400*300*4);e.renderer.readRenderTargetPixels(t,0,0,400,300,a);return a;};
 const diff=(a,b)=>{let max=0,sum=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d;}return {max,mean:sum/a.length};};
 const quality=diff(render(180,320),render(180,640));const boundaries=[.5,80.5,180.5,358.5].map(i=>({index:i,...diff(render(i+.0001,640),render(i-.0001,640))}));
 const forward=render(140.25,640);for(const i of [160,180,200,180,160])render(i,320);const reverse=diff(forward,render(140.25,640));
 lines.forEach(o=>o.visible=true);e.renderer.setRenderTarget(null);t.dispose();e.update(original);return {quality,boundaries,reverse};
});
await fs.writeFile(process.env.BASELINE?'.qa/reverse-before.json':(process.env.INSTANCES?'.qa/reverse-instances.json':'.qa/reverse-after.json'),JSON.stringify(report,null,2));
await p.locator('#opacity').fill('0');
for(const index of [220,200,180,160,140,120]) {await p.evaluate(index=>{const v=window.__volume;v.engine.startInteraction();v.setState({...v.getState(),cuts:[1,1,1-index/360]});},index);await p.waitForTimeout(80);await p.screenshot({path:`.qa/reverse-${process.env.BASELINE?'before':'after'}-${index}.png`});}
await b.close();console.log(JSON.stringify(report));if(!process.env.BASELINE){assert.equal(report.quality.max,0);assert.equal(report.reverse.max,0);assert.ok(report.boundaries.every(r=>r.mean<.01 && r.max<=5));}
