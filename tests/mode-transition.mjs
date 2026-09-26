import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const page=await browser.newPage({viewport:{width:1100,height:850},recordVideo:{dir:'.qa/mode-transition-video'}});await page.goto('http://127.0.0.1:5177');await page.waitForSelector('.is-ready',{timeout:120000});await page.locator('#opacity').fill('0');await page.waitForTimeout(300);
const report=[];
for(const id of ['instance-colors','emphasis']) {
 const values=await page.evaluate(async id=>{document.getElementById(id).click();const samples=[];for(let i=0;i<25;i++){await new Promise(requestAnimationFrame);samples.push(window.__volume.engine.snapshot().modeTransition);}return samples;},id);
 assert.ok(values.some(v=>v>0&&v<1));assert.equal(values.at(-1),0);assert.ok(values.every((v,i)=>i===0||v<=values[i-1]));report.push({id,values});
 await page.screenshot({path:`.qa/mode-${id}-settled.png`});
}
const interrupt=await page.evaluate(async()=>{const e=window.__volume.engine;document.getElementById('emphasis').click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const before=e.snapshot().modeTransition;document.getElementById('emphasis').click();await new Promise(requestAnimationFrame);const restart=e.snapshot().modeTransition;return {before,restart,overlays:document.querySelectorAll('.mode-transition').length};});
assert.ok(interrupt.before>0 && interrupt.restart>0);assert.equal(interrupt.overlays,1);
await page.waitForTimeout(300);await page.locator('#emphasis').uncheck();await page.waitForTimeout(300);
await page.evaluate(()=>document.getElementById('instance-colors').click());await page.waitForTimeout(70);await page.screenshot({path:'.qa/mode-midfade.png'});await page.waitForTimeout(300);
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#instance-colors').check();assert.equal(await page.locator('.mode-transition').count(),0);
await fs.writeFile('.qa/mode-transition.json',JSON.stringify({report,interrupt},null,2));await browser.close();console.log(JSON.stringify({transitions:report.length,interrupt,reducedMotion:true}));
