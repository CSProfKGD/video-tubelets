import { packFrame, packInstanceFrame, type Tier } from './model';

async function pixels(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load volume data (${response.status}).`);
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close();
  return data;
}

self.onmessage = async ({ data }: MessageEvent<{ base: string; tier: Tier }>) => {
  try {
    const { base, tier } = data;
    const volume = new Uint8Array(tier.width * tier.height * tier.depth * 4);
    const instances = new Uint8Array(tier.width * tier.height * tier.depth);
    const frameBytes = tier.width * tier.height * 4;
    for (const chunk of tier.chunks) {
      const [color, mask, instance] = await Promise.all([pixels(new URL(chunk.color, base).href), pixels(new URL(chunk.mask, base).href), pixels(new URL(chunk.instance, base).href)]);
      for (let f = 0; f < chunk.count; f++) {
        packInstanceFrame(instance.subarray(f*frameBytes,(f+1)*frameBytes),tier.width,tier.height,instances,chunk.start+f);
        packFrame(color.subarray(f * frameBytes, (f+1)*frameBytes), mask.subarray(f*frameBytes,(f+1)*frameBytes), tier.width, tier.height, volume, chunk.start + f);
      }
      self.postMessage({ type: 'progress', progress: (chunk.start + chunk.count) / tier.depth });
    }
    self.postMessage({ type: 'ready', buffer: volume.buffer, instanceBuffer: instances.buffer }, { transfer: [volume.buffer, instances.buffer] });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Could not load the volume.' });
  }
};
