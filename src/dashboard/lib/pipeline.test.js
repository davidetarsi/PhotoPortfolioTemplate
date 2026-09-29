// src/dashboard/lib/pipeline.test.js
import { describe, it, expect, vi } from 'vitest';
import { targetDimensions, shouldUploadAsIs, processFile, partitionBySupport, MAX_DIMENSION, WEBP_QUALITY } from './pipeline.js';

describe('targetDimensions', () => {
  it('riduce il lato lungo a 1900 mantenendo l\'aspect ratio', () => {
    expect(targetDimensions(3800, 1900)).toEqual({ width: 1900, height: 950 });
    expect(targetDimensions(1900, 3800)).toEqual({ width: 950, height: 1900 });
  });
  it('non ingrandisce mai', () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('arrotonda a interi', () => {
    const { width, height } = targetDimensions(3001, 2000);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
    expect(width).toBe(1900);
  });
});

describe('shouldUploadAsIs', () => {
  it('true solo per webp già entro i limiti', () => {
    expect(shouldUploadAsIs('image/webp', 1900, 1000)).toBe(true);
    expect(shouldUploadAsIs('image/webp', 1901, 1000)).toBe(false);
    expect(shouldUploadAsIs('image/jpeg', 800, 600)).toBe(false);
  });
});

describe('processFile', () => {
  it('webp piccolo → as-is: nessun encode, blob = file originale, include capturedAt/uploadedAt', async () => {
    const decode = vi.fn(async () => ({ bitmap: 'BMP', width: 1000, height: 800 }));
    const encode = vi.fn();
    const extractCapturedAt = vi.fn(async () => 1700000000000);
    const file = { type: 'image/webp' };
    const res = await processFile(file, { decode, encode, extractCapturedAt });
    expect(res.blob).toBe(file);
    expect(res.width).toBe(1000);
    expect(res.height).toBe(800);
    expect(res.capturedAt).toBe(1700000000000);
    expect(Number.isFinite(res.uploadedAt)).toBe(true);
    expect(encode).not.toHaveBeenCalled();
    expect(extractCapturedAt).toHaveBeenCalledWith(file); // legge il File originale, non bitmap/blob
  });
  it('jpeg grande → resize + encode con qualità 0.85, include capturedAt/uploadedAt', async () => {
    const decode = vi.fn(async () => ({ bitmap: 'BMP', width: 3800, height: 1900 }));
    const encode = vi.fn(async () => 'WEBP_BLOB');
    const extractCapturedAt = vi.fn(async () => undefined); // niente EXIF, es. screenshot
    const file = { type: 'image/jpeg' };
    const res = await processFile(file, { decode, encode, extractCapturedAt });
    expect(encode).toHaveBeenCalledWith('BMP', 1900, 950, WEBP_QUALITY);
    expect(res.blob).toBe('WEBP_BLOB');
    expect(res.width).toBe(1900);
    expect(res.height).toBe(950);
    expect(res.capturedAt).toBeUndefined();
    expect(Number.isFinite(res.uploadedAt)).toBe(true);
  });
  it('MAX_DIMENSION è 1900 (stesso limite di compress.js)', () => {
    expect(MAX_DIMENSION).toBe(1900);
  });
});

describe('partitionBySupport', () => {
  const file = (name, type) => ({ name, type });

  it('tiene jpeg, png e webp', () => {
    const { supported, unsupported } = partitionBySupport([
      file('a.jpg', 'image/jpeg'), file('b.png', 'image/png'), file('c.webp', 'image/webp'),
    ]);
    expect(supported).toHaveLength(3);
    expect(unsupported).toHaveLength(0);
  });

  it('scarta HEIC, che il browser non sa decodificare', () => {
    const { supported, unsupported } = partitionBySupport([file('IMG_0001.HEIC', 'image/heic')]);
    expect(supported).toHaveLength(0);
    expect(unsupported.map(f => f.name)).toEqual(['IMG_0001.HEIC']);
  });

  it('riconosce HEIC anche quando il browser non ne indovina il MIME', () => {
    // Chrome e Firefox non conoscono HEIC: File.type resta stringa vuota.
    // Senza il controllo sull'estensione finirebbe nella pipeline e fallirebbe
    // a decodifica, col messaggio sbagliato ("riprova").
    const { unsupported } = partitionBySupport([file('foto.heic', '')]);
    expect(unsupported).toHaveLength(1);
  });

  it('scarta anche TIFF', () => {
    expect(partitionBySupport([file('scan.tiff', 'image/tiff')]).unsupported).toHaveLength(1);
  });

  it('divide un gruppo misto conservando l ordine', () => {
    const { supported, unsupported } = partitionBySupport([
      file('a.jpg', 'image/jpeg'), file('b.heic', 'image/heic'), file('c.png', 'image/png'),
    ]);
    expect(supported.map(f => f.name)).toEqual(['a.jpg', 'c.png']);
    expect(unsupported.map(f => f.name)).toEqual(['b.heic']);
  });

  it('su un elenco vuoto non esplode', () => {
    expect(partitionBySupport([])).toEqual({ supported: [], unsupported: [] });
  });
});
