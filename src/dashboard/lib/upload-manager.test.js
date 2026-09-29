import { describe, it, expect, vi } from 'vitest';
import { runBatch, attachBeforeUnloadGuard } from './upload-manager.js';

const file = name => ({ name }); // basta .name per il manager
const okProcess = async () => ({ blob: 'BLOB', width: 10, height: 20, capturedAt: 1700000000000, uploadedAt: 1700000000001 });

function makeDeps() {
  const calls = { uploads: [], manifests: [] };
  return {
    calls,
    processFile: okProcess,
    uploadPhoto: vi.fn(async name => { calls.uploads.push(name); }),
    putManifest: vi.fn(async entries => { calls.manifests.push(entries); }),
  };
}

describe('runBatch', () => {
  it('assegna nomi dedotti PRIMA degli upload (dedup su manifest + batch)', async () => {
    const d = makeDeps();
    const existing = [{ name: 'img_001.webp', width: 1, height: 1 }];
    const res = await runBatch({
      files: [file('IMG_001.JPG'), file('img 001.png')], // il primo collide col manifest → suffisso -2; il secondo normalizza in img-001.webp (nessuna collisione)
      existingManifest: existing, ...d,
    });
    expect(res.uploaded.map(u => u.name)).toEqual(['img_001-2.webp', 'img-001.webp']);
    expect(res.manifest).toEqual([...existing, ...res.uploaded]);
    expect(d.calls.manifests).toHaveLength(1); // UNA sola scrittura manifest
    expect(res.uploaded[0].capturedAt).toBe(1700000000000);
    expect(res.uploaded[0].uploadedAt).toBe(1700000000001);
  });

  it('due file identici nello stesso batch non si sovrascrivono', async () => {
    const d = makeDeps();
    const res = await runBatch({ files: [file('a.jpg'), file('A.jpg')], existingManifest: [], ...d });
    expect(res.uploaded.map(u => u.name)).toEqual(['a.webp', 'a-2.webp']);
  });

  it('un fallimento non blocca il batch: manifest include solo le riuscite', async () => {
    const d = makeDeps();
    d.uploadPhoto = vi.fn(async name => { if (name === 'b.webp') throw new Error('boom'); });
    const res = await runBatch({ files: [file('a.jpg'), file('b.jpg'), file('c.jpg')], existingManifest: [], ...d });
    expect(res.uploaded.map(u => u.name)).toEqual(['a.webp', 'c.webp']);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].name).toBe('b.webp');
    expect(d.calls.manifests[0].map(e => e.name)).toEqual(['a.webp', 'c.webp']);
  });

  it('rispetta la concorrenza massima (3)', async () => {
    let active = 0, maxActive = 0;
    const d = makeDeps();
    d.processFile = async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return { blob: 'B', width: 1, height: 1 };
    };
    await runBatch({ files: Array.from({ length: 9 }, (_, i) => file(`f${i}.jpg`)), existingManifest: [], ...d });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('attacca la guardia all\'avvio e la stacca a manifest salvato (anche su errore)', async () => {
    const d = makeDeps();
    let attached = 0, detached = 0;
    const attachGuard = () => { attached++; return () => { detached++; }; };
    await runBatch({ files: [file('a.jpg')], existingManifest: [], attachGuard, ...d });
    expect(attached).toBe(1);
    expect(detached).toBe(1);
    // putManifest esplode → la guardia si stacca comunque
    d.putManifest = vi.fn(async () => { throw new Error('boom'); });
    await expect(runBatch({ files: [file('a.jpg')], existingManifest: [], attachGuard, ...d })).rejects.toThrow('boom');
    expect(detached).toBe(2);
  });

  it('onProgress riceve le fasi per ogni file', async () => {
    const d = makeDeps();
    const events = [];
    await runBatch({
      files: [file('a.jpg')], existingManifest: [], ...d,
      onProgress: (name, phase) => events.push(`${name}:${phase}`),
    });
    expect(events).toEqual(['a.webp:processing', 'a.webp:uploading', 'a.webp:done']);
  });
});

describe('attachBeforeUnloadGuard', () => {
  it('aggiunge e rimuove il listener beforeunload', () => {
    const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const detach = attachBeforeUnloadGuard(win);
    expect(win.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    detach();
    const handler = win.addEventListener.mock.calls[0][1];
    expect(win.removeEventListener).toHaveBeenCalledWith('beforeunload', handler);
  });
});
