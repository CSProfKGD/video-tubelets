import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const results=[];
for(const scale of [1,2]) {
 const page=await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:scale});
 await page.goto('http://127.0.0.1:5177');await page.waitForSelector('.is-ready',{timeout:120000});
 const box=await page.locator('#slice').boundingBox();
 for(const fraction of [.2,.53,.82]) {
  await page.mouse.move(box.x+box.width*.05,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*fraction,box.y+box.height/2,{steps:12});
  const active=await page.evaluate(()=>{const e=window.__volume.engine;return {ratio:e.renderer.getPixelRatio(),width:e.renderer.domElement.width,active:e.active};});
  assert.equal(active.ratio,scale);assert.equal(active.active,true);
  await page.screenshot({path:`.qa/scrub-${scale}-${fraction}-active.png`});
  // Isolate both outlines to distinguish line coverage from volume quality changes.
  await page.evaluate(()=>{const e=window.__volume.engine;e.scene.children.filter(o=>o.isMesh&&!o.isLineSegments2).forEach(o=>o.visible=false);e.requestRender();});
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const before=await page.locator('canvas').screenshot();
  await page.mouse.up();await page.waitForTimeout(250);
  const after=await page.locator('canvas').screenshot();
  assert.ok(before.equals(after),`Outline pixels changed on release at DPR ${scale}, ${fraction}`);
  await fs.writeFile(`.qa/scrub-${scale}-${fraction}-lines.png`,before);
  await page.evaluate(()=>{const e=window.__volume.engine;e.scene.children.filter(o=>o.isMesh&&!o.isLineSegments2).forEach(o=>o.visible=true);e.requestRender();});
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await page.screenshot({path:`.qa/scrub-${scale}-${fraction}-settled.png`});
  results.push({scale,fraction,pixelIdenticalOutlines:true});
 }
 await page.close();
}
await browser.close();await fs.writeFile('.qa/scrub-outline.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
