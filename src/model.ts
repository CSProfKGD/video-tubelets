export type Plane = 'XY';
export type Bounds = [number, number, number];
export type VolumeState = { cuts: Bounds; plane: Plane; opacity: number; emphasizeSlice: boolean; instanceColors: boolean };
export type Tier = { width: number; height: number; depth: number; timestamps: number[]; sourceFrames: number[]; gpuBytes: number; chunks: { start: number; count: number; color: string; mask: string; instance: string }[] };
export type Manifest = { version: number; duration: number; crop: { x: number; y: number; width: number; height: number }; tiers: Record<'desktop' | 'compact', Tier> };
export const initialState = (): VolumeState => ({ cuts: [1, 1, 1], plane: 'XY', opacity: 1, emphasizeSlice: false, instanceColors: false });
export const easeInOut = (value: number) => {
  const t = Math.max(0,Math.min(1,value));
  return t*t*(3-2*t);
};
export const volumeCenter = (cuts: Bounds, size: Bounds): Bounds => cuts.map((cut,axis)=>(cut-1)*size[axis]/2) as Bounds;
export const planeAxis = (_plane: Plane): 2 => 2;
export const dimensions = (tier: Tier): Bounds => [tier.width, tier.height, tier.depth];
export const cutIndex = (cut: number, count: number) => Math.max(0, Math.min(count - 1, Math.round(cut * count) - 1));
export const timeIndex = (cut: number, count: number) => Math.max(0, Math.min(count-1, Math.round((1-cut)*count)));
export function changeCut(state: VolumeState, value: number, counts: Bounds): VolumeState {
  const axis = planeAxis(state.plane);
  const cuts: Bounds = [1, 1, state.cuts[2]];
  cuts[axis] = Math.max(1 / counts[axis], Math.min(1, value));
  return { ...state, cuts };
}
export function keyboardCut(state: VolumeState, key: string, shift: boolean, counts: Bounds): VolumeState {
  const axis = planeAxis(state.plane);
  const delta = (shift ? 10 : 1) / counts[axis];
  const forward = ['ArrowRight', 'ArrowUp'].includes(key) ? delta : -delta;
  const value = key === 'Home' ? 1 : key === 'End' ? 1/counts[axis] : state.cuts[axis] - forward;
  return changeCut(state, value, counts);
}
export function coordinateOffset(x: number, y: number, t: number, width: number, height: number): number {
  return ((t * height + y) * width + x) * 4;
}
export function packFrame(color: Uint8ClampedArray, mask: Uint8ClampedArray, width: number, height: number, target: Uint8Array, frame: number) {
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = ((height - 1 - y) * width + x) * 4;
    const dst = coordinateOffset(x, y, frame, width, height);
    target[dst] = color[src]; target[dst + 1] = color[src + 1]; target[dst + 2] = color[src + 2]; target[dst + 3] = mask[src];
  }
}
export function alphaForStep(confidence: number, background: number, step: number, voxelRate: number) {
  if (background >= 1) return 1;
  const t = Math.max(0,Math.min(1,(confidence-.15)/.5));
  confidence = t*t*(3-2*t);
  if (confidence>=.9999) return 1;
  const density = -Math.log(Math.max(1 - confidence, .00001)) * voxelRate - Math.log(Math.max(1-background,.0001));
  return 1 - Math.exp(-density * step);
}

export function fractionalTimeIndex(cut: number, count: number) {
  return Math.max(0, Math.min(count - 1, (1 - cut) * count));
}
export function timestampAt(index: number, timestamps: number[]) {
  const i = Math.max(0, Math.min(timestamps.length - 1, index));
  const lo = Math.floor(i), hi = Math.min(timestamps.length - 1, lo + 1);
  return timestamps[lo] + (timestamps[hi] - timestamps[lo]) * (i - lo);
}
export const temporalWeight = (seconds: number) => Math.exp(-Math.pow(Math.max(0, seconds) / 2, 2));
export function emphasizedAlpha(baseAlpha: number, seconds: number, voxelSteps: number) {
  const alpha = baseAlpha * temporalWeight(seconds);
  return 1 - Math.pow(1 - alpha, voxelSteps);
}

export function packInstanceFrame(source: Uint8ClampedArray, width: number, height: number, target: Uint8Array, frame: number) {
  for(let y=0;y<height;y++) for(let x=0;x<width;x++)
    target[(frame*height+y)*width+x]=source[((height-1-y)*width+x)*4];
}
