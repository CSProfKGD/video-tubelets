import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const b=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true});const p=await b.newPage({viewport:{width:1440,height:1000}});await p.goto('http://127.0.0.1:5177');await p.waitForSelector('.is-ready',{timeout:120000});
const results=await p.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js');const {fragment}=await import('/src/shaders.ts');const e=window.__volume.engine;
 const rgb=[70,80,90];const volume=new T.Data3DTexture(new Uint8Array([...rgb,0]),1,1,1);volume.format=T.RGBAFormat;volume.needsUpdate=true;
 const ids=new T.Data3DTexture(new Uint8Array([0]),1,1,1);ids.format=T.RedFormat;ids.unpackAlignment=1;ids.needsUpdate=true;
 const mat=new T.ShaderMaterial({glslVersion:T.GLSL3,vertexShader:'out vec3 vWorld;void main(){vWorld=vec3(.5);gl_Position=vec4(position.xy,0,1);}',fragmentShader:fragment.split('void main()')[0]+'void main(){outColor=sampleAt(vec3(.5));}',uniforms:{...e.material.uniforms,uVolume:{value:volume},uInstances:{value:ids},uCounts:{value:new T.Vector3(1,1,1)},uCuts:{value:new T.Vector3(1,1,1)},uOpacity:{value:1},uInstanceColors:{value:1}}});
 const scene=new T.Scene();scene.add(new T.Mesh(new T.PlaneGeometry(2,2),mat));const target=new T.WebGLRenderTarget(1,1);const rows=[];
 for(const alpha of [0,1,2,128,255])for(const opacity of [0,.5,.99,1]){
  volume.image.data[3]=alpha;volume.needsUpdate=true;ids.image.data[0]=Math.round(alpha*128/255);ids.needsUpdate=true;mat.uniforms.uOpacity.value=opacity;
  e.renderer.setRenderTarget(target);e.renderer.render(scene,new T.Camera());const px=new Uint8Array(4);e.renderer.readRenderTargetPixels(target,0,0,1,1,px);rows.push({alpha,opacity,rgb:[...px.slice(0,3)]});
 }
 e.renderer.setRenderTarget(null);volume.dispose();ids.dispose();mat.dispose();target.dispose();return rows;
});
await fs.mkdir('.qa/instance-background',{recursive:true});await fs.writeFile('.qa/instance-background/probes.json',JSON.stringify(results,null,2));
await p.locator('#opacity').fill('100');await p.getByLabel('Slice only',{exact:true}).check();await p.getByLabel('Instances',{exact:true}).check();await p.locator('#slice').fill('209');await p.locator('#slice').blur();await p.waitForTimeout(400);await p.screenshot({path:'.qa/instance-background/14s.png'});await b.close();
for(const r of results){const a=r.alpha/255;const w=a/Math.max(a+r.opacity*(1-a),1e-6);const person=r.alpha?Math.max(0,Math.min(1,(Math.round(r.alpha*128/255)/r.alpha*255-128)/127)):0;const palette=[99,230,222].map((c,i)=>c*(1-person)+[255,159,122][i]*person);const expected=[70,80,90].map((c,i)=>Math.round(c*(1-w)+palette[i]*w));assert.ok(r.rgb.every((c,i)=>Math.abs(c-expected[i])<=2),JSON.stringify({r,expected}));}
console.log('GPU probes: background preserved, opaque identities retained, and partial coverage blends continuously at all opacity endpoints.');
