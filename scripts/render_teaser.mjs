import fs from 'node:fs/promises';import {spawn} from 'node:child_process';import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const short=process.argv.includes('--short'),profile=short?'short':'full';
const preview=process.argv.includes('--storyboard'),width=1920,height=1080,fps=60,duration=short?JSON.parse(await fs.readFile('scripts/teaser-short.json','utf8')).outputDuration:32;
const qa=short?'.qa/teaser-short':'.qa/teaser',silent=short?'exports/teaser-short-silent.mp4':'exports/teaser-silent.mp4';
await fs.mkdir(qa,{recursive:true});await fs.mkdir('exports',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});await page.emulateMedia({reducedMotion:'reduce'});
page.on('pageerror',e=>console.error(e));await page.goto('http://127.0.0.1:5177');await page.waitForSelector('.is-ready',{timeout:120000});
console.log(await page.evaluate(async({width,height,profile})=>(await import('/scripts/teaser-director.js')).initTeaser(width,height,profile),{width,height,profile}));
if(preview){for(const t of short?[0,1,2,3.2,5.5,6.4,7.4,9.2,10.3,11.6,13.2,14.99]:[0,2.5,5,8,16,23.8,24.8,25.6,26.7,28,29.5,31.5]){const png=await page.evaluate(t=>window.teaserFrame(t),t);await fs.writeFile(`${qa}/story-${t}.png`,Buffer.from(png,'base64'));console.log('Storyboard',t);}await browser.close();process.exit(0);}
const ff=spawn('/opt/homebrew/bin/ffmpeg',['-y','-v','warning','-f','image2pipe','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',silent],{stdio:['pipe','ignore','inherit']});
const started=Date.now();
for(let frame=0;frame<fps*duration;frame++){
 const png=Buffer.from(await page.evaluate(t=>window.teaserFrame(t),frame/fps),'base64');
 if(!ff.stdin.write(png))await once(ff.stdin,'drain');
 if(frame%30===0)console.log(`Rendered ${frame}/${fps*duration} (${Math.round((Date.now()-started)/1000)}s)`);
}
await fs.writeFile(`${qa}/framing.json`,JSON.stringify(await page.evaluate(()=>window.teaserAudit),null,2));
ff.stdin.end();const [code]=await once(ff,'close');await browser.close();if(code)throw new Error(`ffmpeg ${code}`);console.log('Rendered full silent master.');
