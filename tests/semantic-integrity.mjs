import {chromium} from 'playwright';import fs from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true});const p=await b.newPage({viewport:{width:1200,height:900}});
// Simulate one-bit canvas readback noise in the worker. Semantic bytes must
// stay identical to source data even when the display-image path is perturbed.
let injected=false;
await p.route('**/src/loader.worker.ts*',async route=>{
 injected=true;const response=await route.fetch();const body=await response.text();
 await route.fulfill({response,body:`const originalRead=OffscreenCanvasRenderingContext2D.prototype.getImageData;OffscreenCanvasRenderingContext2D.prototype.getImageData=function(...args){const r=originalRead.apply(this,args);for(let i=0;i<r.data.length;i+=4)r.data[i]^=1;return r;};\n${body}`});
});
await p.goto('http://127.0.0.1:5177');await p.waitForSelector('.is-ready,[role=alert]',{timeout:90000});assert.equal(await p.locator('[role=alert]').count(),0,await p.locator('[role=alert]').allTextContents());
assert.ok(injected,'Worker canvas noise hook must run');
const actual=await p.evaluate(async()=>{
 const e=window.__volume.engine;const a=e.texture.image.data;const alpha=new Uint8Array(a.length/4);for(let i=0;i<alpha.length;i++)alpha[i]=a[i*4+3];
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 return {alpha:await hash(alpha),instance:await hash(e.instances.image.data)};
});
const tier=JSON.parse(await fs.readFile('public/volume/manifest.json','utf8')).tiers.desktop;
for(const [field,key] of [['mask','alpha'],['instance','instance']]){
 const hash=createHash('sha256');for(const c of tier.chunks){const raw=gunzipSync(await fs.readFile('public/volume/'+c[field+'Data']));for(let f=0;f<c.count;f++)for(let y=tier.height-1;y>=0;y--){const start=(f*tier.height+y)*tier.width;hash.update(raw.subarray(start,start+tier.width));}}
 assert.equal(actual[key],hash.digest('hex'),key+' must match every source byte despite canvas noise');
}
await p.locator('#opacity').fill('0');await p.getByLabel('Instances',{exact:true}).check();await p.locator('#slice').fill('138');await p.locator('#slice').blur();await p.waitForTimeout(400);await fs.mkdir('.qa/semantic-integrity',{recursive:true});await p.screenshot({path:'.qa/semantic-integrity/volume.png'});await b.close();console.log('Full desktop mask and identity texture hashes match source bytes with canvas noise injected.');
