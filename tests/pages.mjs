import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url=process.env.SITE_URL || 'http://127.0.0.1:5180/video-tubelets/';
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true});
const results=[];
await fs.mkdir('.qa/pages',{recursive:true});
for(const mobile of [false,true]) {
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400) errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(url);await page.waitForSelector('.is-ready',{timeout:180000});
 assert.equal(await page.title(),'Video Tubelets');
 assert.equal(await page.locator('input[type=checkbox]').count(),2);
 await page.locator('#opacity').fill('0');await page.getByLabel('Instances',{exact:true}).check();await page.waitForTimeout(350);
 await page.screenshot({path:`.qa/pages/${mobile?'mobile':'desktop'}-instances.png`});
 await page.getByLabel('Slice only',{exact:true}).check();await page.locator('#slice').focus();await page.keyboard.press('End');await page.waitForTimeout(350);
 await page.screenshot({path:`.qa/pages/${mobile?'mobile':'desktop'}-slice.png`});
 await page.locator('#opacity').fill('100');
 const max=Number(await page.locator('#slice').getAttribute('max'));await page.locator('#slice').fill(String(Math.round(max*14.1/24.191708)));await page.locator('#slice').blur();await page.waitForTimeout(350);
 await page.screenshot({path:`.qa/pages/${mobile?'mobile':'desktop'}-opaque-instances.png`});
 await page.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForTimeout(800);
 assert.equal(await page.locator('#opacity').inputValue(),'100');assert.equal(await page.locator('#slice').inputValue(),'0');
 assert.equal(await page.locator('input[type=checkbox]:checked').count(),0);
 const fit=await page.locator('.controls').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});assert.ok(fit);
 assert.deepEqual(errors,[]);results.push({mobile,errors,controlsFit:fit});await page.close();
}
await browser.close();await fs.writeFile('.qa/pages/check.json',JSON.stringify({url,results},null,2));console.log(JSON.stringify({url,results}));
