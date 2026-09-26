import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1100,height:850},deviceScaleFactor:2});await page.goto('http://127.0.0.1:5177');await page.waitForSelector('.is-ready',{timeout:120000});
const results=await page.evaluate(async()=>{
 const THREE=await import('/node_modules/three/build/three.module.js');const e=window.__volume.engine,original=e.state;
 const target=new THREE.WebGLRenderTarget(600,440);e.material.colorWrite=false;
 const render=()=>{e.camera.updateMatrixWorld();e.material.uniforms.uViewProjection.value.multiplyMatrices(e.camera.projectionMatrix,e.camera.matrixWorldInverse);e.renderer.setRenderTarget(target);e.renderer.render(e.scene,e.camera);const bytes=new Uint8Array(600*440*4);e.renderer.readRenderTargetPixels(target,0,0,600,440,bytes);return bytes;};
 const results=[];
 for(const slice of [false,true]) {
  let baseline;
  for(const opacity of [0,.01,.03,.1,.9998,1]){
   e.update({...original,opacity,emphasizeSlice:slice});e.material.uniforms.uEmphasis.value=slice?1:0;const bytes=render();
   if(!baseline)baseline=bytes;let max=0,changed=0;
   for(let i=0;i<bytes.length;i++){const d=Math.abs(bytes[i]-baseline[i]);max=Math.max(max,d);if(d)changed++;}
   results.push({slice,opacity,max,changed});
  }
 }
 e.material.colorWrite=true;e.renderer.setRenderTarget(null);target.dispose();e.update(original);e.requestRender();return results;
});
assert.ok(results.every(r=>r.max===0),JSON.stringify(results));
for(const value of ['1','3','5']) {await page.locator('#opacity').fill(value);await page.locator('#opacity').blur();await page.waitForTimeout(300);await page.screenshot({path:`.qa/transparent-depth-${value}.png`});}
await browser.close();await fs.writeFile('.qa/transparent-depth.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
