import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const b=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:1000,height:800}});await p.goto('http://127.0.0.1:5177');await p.waitForSelector('.is-ready',{timeout:120000});
const report=await p.evaluate(async()=>{
 const THREE=await import('/node_modules/three/build/three.module.js');const e=window.__volume.engine,t=new THREE.WebGLRenderTarget(400,300),original=e.state;
 const render=light=>{e.material.uniforms.uInstanceLighting.value=light;e.camera.updateMatrixWorld();e.material.uniforms.uViewProjection.value.multiplyMatrices(e.camera.projectionMatrix,e.camera.matrixWorldInverse);e.renderer.setRenderTarget(t);e.renderer.render(e.scene,e.camera);const a=new Uint8Array(400*300*4);e.renderer.readRenderTargetPixels(t,0,0,400,300,a);return a;};
 const results=[];
 for(const [instances,slice] of [[true,false],[true,true],[false,false]]) {
  e.update({...original,instanceColors:instances,emphasizeSlice:slice,opacity:0});e.material.uniforms.uEmphasis.value=slice?1:0;
  const a=render(0),b=render(1);let max=0,sum=0;
  for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d;}
  results.push({instances,slice,max,mean:sum/a.length});
 }
 e.renderer.setRenderTarget(null);t.dispose();e.update(original);return results;
});await b.close();await fs.writeFile('.qa/instance-satin.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(report[0].mean>.1);assert.equal(report[1].max,0);assert.equal(report[2].max,0);
