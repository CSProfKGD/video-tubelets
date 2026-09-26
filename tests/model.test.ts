import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, changeCut, keyboardCut, cutIndex, coordinateOffset, packFrame, packInstanceFrame, alphaForStep, easeInOut, volumeCenter, timeIndex, temporalWeight, emphasizedAlpha, fractionalTimeIndex, timestampAt } from '../src/model.ts';

test('XY is the only slicing axis and emphasis defaults off', () => {
  const state=changeCut(initialState(),.4,[800,340,360]);
  assert.deepEqual(state.cuts,[1,1,.4]);
  assert.equal(state.emphasizeSlice,false);
  assert.equal(state.instanceColors,false);
  assert.equal(state.opacity,1);
});
test('bounds retain one sample, including keyboard endpoints', () => {
  const state=changeCut(initialState(),-5,[364,240,360]);
  assert.equal(state.cuts[2],1/360);
  assert.equal(cutIndex(state.cuts[2],360),0);
  assert.equal(changeCut(state,3,[364,240,360]).cuts[2],1);
  assert.equal(cutIndex(1,360),359);
  assert.equal(keyboardCut(initialState(),'End',false,[364,240,360]).cuts[2],1/360);
  assert.equal(keyboardCut(state,'ArrowDown',true,[364,240,360]).cuts[2],11/360);
});
test('worker row reversal preserves color even where confidence is zero', () => {
  const color = new Uint8ClampedArray([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);
  const mask = new Uint8ClampedArray([0,0,0,255,100,100,100,255,200,200,200,255,255,255,255,255]);
  const volume = new Uint8Array(32);
  packFrame(color,mask,2,2,volume,1);
  assert.deepEqual([...volume.slice(16)],[7,8,9,200,10,11,12,255,1,2,3,0,4,5,6,100]);
  assert.equal(coordinateOffset(1,0,1,2,2),20);
});
test('opacity endpoints preserve foreground and remove static background', () => {
  assert.equal(alphaForStep(0,0,.01,300),0);
  assert.equal(alphaForStep(0,1,.01,300),1);
  assert.equal(alphaForStep(1,0,.01,300),1);
  assert.equal(alphaForStep(1,.5,.001,300),1);
  assert.ok(alphaForStep(0,.5,.01,300)>0);
});
test('splitting a ray step leaves accumulated opacity unchanged', () => {
  for(const confidence of [0,.01,.5,1]) {
    const whole = alphaForStep(confidence,.2,.02,200);
    const half = alphaForStep(confidence,.2,.01,200);
    assert.ok(Math.abs(whole-(1-(1-half)**2))<1e-12);
  }
});
test('orbit centre is the midpoint of each retained bound',()=>{
  assert.deepEqual(volumeCenter([1,1,1],[3,2,2.6]),[0,0,0]);
  assert.ok(volumeCenter([.4,.5,.2],[3,2,2.6]).every((value,index)=>Math.abs(value-[-.9,-.5,-1.04][index])<1e-12));
});
test('reset easing starts and ends gently, with monotonic progress',()=>{
  assert.equal(easeInOut(0),0);assert.equal(easeInOut(1),1);assert.equal(easeInOut(.5),.5);
  assert.ok(easeInOut(.1)<.1);assert.ok(easeInOut(.9)>.9);
  for(let i=1;i<=100;i++) assert.ok(easeInOut(i/100)>easeInOut((i-1)/100));
});

test('time slicing discards earliest frames and preserves the last frame',()=>{
  const counts: [number,number,number]=[728,480,360];
  let state=initialState();
  assert.equal(timeIndex(state.cuts[2],360),0);
  state=keyboardCut(state,'ArrowRight',true,counts);
  assert.equal(timeIndex(state.cuts[2],360),10);
  state=keyboardCut(state,'End',false,counts);
  assert.equal(timeIndex(state.cuts[2],360),359);
  assert.equal(state.cuts[2],1/360);
  assert.equal(keyboardCut(state,'Home',false,counts).cuts[2],1);
});

test('temporal falloff is continuous, monotonic and fixed in seconds',()=>{
  assert.equal(temporalWeight(0),1);
  assert.equal(temporalWeight(2),Math.exp(-1));
  for(let t=.01;t<24;t+=.01) assert.ok(temporalWeight(t)<temporalWeight(t-.01));
  assert.ok(Math.abs(temporalWeight(1.9999)-temporalWeight(2.0001))<.0001);
});
test('emphasized integration is invariant under ray-step subdivision',()=>{
  for(const alpha of [0,.25,.8,1]) for(const t of [0,.01,1,3,20]) {
    const whole=emphasizedAlpha(alpha,t,1.7), half=emphasizedAlpha(alpha,t,.85);
    assert.ok(Math.abs(whole-(1-(1-half)**2))<1e-12);
  }
  assert.equal(emphasizedAlpha(1,0,.5),1);
});
test('fractional scrubbing uses actual timestamp interpolation',()=>{
  assert.ok(Math.abs(fractionalTimeIndex(1-12.25/360,360)-12.25)<1e-12);
  assert.equal(timestampAt(1.5,[0,.04,.09]),.065);
  assert.equal(timestampAt(5,[0,.04,.09]),.09);
});

test('instance upload preserves identities and reverses rows with the RGB volume', () => {
  const source=new Uint8ClampedArray([128,128,128,255,255,255,255,255,0,0,0,255,64,64,64,255]);
  const target=new Uint8Array(8);
  packInstanceFrame(source,2,2,target,1);
  assert.deepEqual([...target],[0,0,0,0,0,64,128,255]);
});
