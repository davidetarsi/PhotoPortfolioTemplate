import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeProcessDeps } from './encoder.js';

describe('makeProcessDeps', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('decodes images and encodes them as native WebP when supported', async () => {
    const bitmap = { width: 640, height: 480 };
    const file = { name: 'photo.jpg' };
    const webp = new Blob(['webp'], { type: 'image/webp' });
    const context = { drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn(callback => callback(webp)),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));

    const deps = await makeProcessDeps();

    await expect(deps.decode(file)).resolves.toEqual({ bitmap, width: 640, height: 480 });
    await expect(deps.encode(bitmap, 320, 240, 0.8)).resolves.toBe(webp);
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 320, 240);
  });
});
