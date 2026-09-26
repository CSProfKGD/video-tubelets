"""Lossless chunk packaging shared by the dancer preprocessing pipeline."""
from PIL import Image

def package(rgb, masks, name, timestamps, ids, output):
    depth, height, width, _ = rgb.shape
    folder = output / name
    folder.mkdir(parents=True, exist_ok=True)
    chunks = []
    for start in range(0, depth, 24):
        end = min(depth, start+24)
        color_name, mask_name = f'color-{start:04d}.webp', f'mask-{start:04d}.png'
        # Opaque lossless RGB retains exact source samples even where the mask is zero.
        Image.fromarray(rgb[start:end].reshape(-1, width, 3)).save(folder / color_name, lossless=True, method=4)
        Image.fromarray(masks[start:end].reshape(-1, width)).save(folder / mask_name, optimize=True)
        chunks.append({'start': start, 'count': end-start, 'color': f'{name}/{color_name}', 'mask': f'{name}/{mask_name}'})
    return {'width': width, 'height': height, 'depth': depth, 'timestamps': timestamps, 'sourceFrames': ids, 'chunks': chunks, 'gpuBytes': width*height*depth*4}


if __name__=="__main__":
    from package_dancers import main
    main()
