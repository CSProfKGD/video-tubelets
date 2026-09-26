import { type Tier } from './model';

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

async function semanticBytes(url: string, expectedLength: number, expectedHash: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error('Unable to load segmentation data.');
  const bytes = new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  if (bytes.length !== expectedLength || hash !== expectedHash) throw new Error('Segmentation data integrity check failed. Please reload.');
  return bytes;
}

self.onmessage = async ({ data }: MessageEvent<{ base: string; tier: Tier }>) => {
  try {
    const { base, tier } = data;
    const volume = new Uint8Array(tier.width * tier.height * tier.depth * 4);
    const instances = new Uint8Array(tier.width * tier.height * tier.depth);
    for (const chunk of tier.chunks) {
      const [color, mask, instance] = await Promise.all([pixels(new URL(chunk.color, base).href), semanticBytes(new URL(chunk.maskData, base).href, tier.width*tier.height*chunk.count, chunk.maskSha256), semanticBytes(new URL(chunk.instanceData, base).href, tier.width*tier.height*chunk.count, chunk.instanceSha256)]);
      // Only display RGB passes through canvas. Coverage and identities remain
      // exact numeric data, including zero background and antialiased boundaries.
      for (let f = 0; f < chunk.count; f++) for (let y = 0; y < tier.height; y++) for (let x = 0; x < tier.width; x++) {
        const src = (f*tier.height + tier.height-1-y)*tier.width+x;
        const dst = ((chunk.start+f)*tier.height+y)*tier.width+x;
        volume[dst*4] = color[src*4]; volume[dst*4+1] = color[src*4+1]; volume[dst*4+2] = color[src*4+2];
        volume[dst*4+3] = mask[src]; instances[dst] = instance[src];
      }
      self.postMessage({ type: 'progress', progress: (chunk.start + chunk.count) / tier.depth });
    }
    self.postMessage({ type: 'ready', buffer: volume.buffer, instanceBuffer: instances.buffer }, { transfer: [volume.buffer, instances.buffer] });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Could not load the volume.' });
  }
};
