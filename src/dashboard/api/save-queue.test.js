// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveQueue, SAVE_DELAY_MS } from './save-queue.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function makeQueue(saveImpl = async () => {}) {
  const saved = [];
  const save = vi.fn(async (key, value) => { await saveImpl(key, value); saved.push([key, value]); });
  return { queue: createSaveQueue({ save }), save, saved };
}

describe('createSaveQueue', () => {
  it('saves after the delay, only the latest value of each resource', async () => {
    const { queue, saved } = makeQueue();
    queue.set('albums', 1);
    queue.set('albums', 2);
    expect(queue.getState().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual([['albums', 2]]);
    expect(queue.getState()).toEqual({ pending: 0, saving: false, paused: false, error: null });
  });

  it('keeps the order in which resources were first changed', async () => {
    const { queue, saved } = makeQueue();
    queue.set('albums', 'with new album');
    queue.set('manifest:notte', []);
    queue.set('albums', 'renamed');
    await queue.flush();
    expect(saved.map(([key]) => key)).toEqual(['albums', 'manifest:notte']);
    expect(saved[0][1]).toBe('renamed');
  });

  it('flush saves at once; busy() says whether anything is waiting or being saved', async () => {
    const { queue, saved } = makeQueue();
    expect(queue.busy()).toBe(false);
    queue.set('albums', 1);
    expect(queue.busy()).toBe(true);
    await queue.flush();
    expect(saved).toEqual([['albums', 1]]);
    expect(queue.busy()).toBe(false);
  });

  it('paused: changes wait in memory and are saved after resume, none lost', async () => {
    const { queue, saved } = makeQueue();
    queue.pause();
    queue.set('albums', 'during the publication');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
    await queue.flush();
    expect(saved).toEqual([]);
    expect(queue.getState()).toMatchObject({ pending: 1, paused: true });
    queue.resume();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saved).toEqual([['albums', 'during the publication']]);
  });

  it('a failed save keeps the change and reports the error; the next flush retries', async () => {
    let fail = true;
    const { queue, saved } = makeQueue(async () => { if (fail) throw new Error('offline'); });
    queue.set('albums', 1);
    await queue.flush();
    expect(queue.getState()).toMatchObject({ pending: 1, error: { key: 'albums', message: 'offline' } });
    fail = false;
    await queue.flush();
    expect(saved).toEqual([['albums', 1]]);
    expect(queue.getState().error).toBeNull();
  });

  it('a change made while a save runs is saved right after it', async () => {
    let release;
    const { queue, saved } = makeQueue(key => (key === 'albums' && !release ? new Promise(r => { release = r; }) : undefined));
    queue.set('albums', 1);
    const first = queue.flush();
    queue.set('manifest:notte', []);
    release();
    await first;
    expect(saved.map(([key]) => key)).toEqual(['albums', 'manifest:notte']);
  });

  it('a save that fails keeps its place in line; its error clears only when it is saved', async () => {
    let fail = true;
    const { queue, saved } = makeQueue(async key => { if (key === 'albums' && fail) throw new Error('offline'); });
    queue.set('albums', 1);
    queue.set('manifest:nuovo', []);
    await queue.flush();
    expect(queue.getState().error).toMatchObject({ key: 'albums' });
    fail = false;
    await queue.flush();
    expect(saved.map(([key]) => key)).toEqual(['albums', 'manifest:nuovo']);
    expect(queue.getState().error).toBeNull();
  });

  it('clear(): a save running at that moment that then fails is not brought back', async () => {
    let reject;
    const { queue } = makeQueue(() => new Promise((_, r) => { reject = r; }));
    queue.set('albums', 'discarded');
    const running = queue.flush();
    queue.pause();
    queue.clear();
    reject(new Error('offline'));
    await running;
    expect(queue.getState()).toMatchObject({ pending: 0, error: null });
    expect(queue.holds('albums')).toBe(false);
  });

  it('valueOf and holds cover the value waiting and the one being saved', async () => {
    let release;
    const { queue } = makeQueue((key, value) => (value === 'saving' ? new Promise(r => { release = r; }) : undefined));
    queue.set('albums', 'saving');
    const running = queue.flush();
    expect(queue.holds('albums')).toBe(true);
    expect(queue.valueOf('albums')).toBe('saving');
    queue.set('albums', 'newer');
    expect(queue.valueOf('albums')).toBe('newer');
    release();
    await running;
    await queue.flush();
    expect(queue.holds('albums')).toBe(false);
  });

  it('tells subscribers when its state changes', async () => {
    const { queue } = makeQueue();
    const listener = vi.fn();
    const stop = queue.subscribe(listener);
    queue.set('albums', 1);
    await queue.flush();
    expect(listener).toHaveBeenCalled();
    stop();
  });

  it('a value the Worker refuses is set aside: the other resources still save, and it stays on screen', async () => {
    const refusal = Object.assign(new Error('site.name is required'), { status: 400 });
    const { queue, saved } = makeQueue(async key => { if (key === 'site') throw refusal; });
    queue.set('site', { name: '' });
    queue.set('albums', 'renamed');
    await queue.flush();
    expect(saved).toEqual([['albums', 'renamed']]);
    expect(queue.getState().error).toEqual({ key: 'site', message: 'site.name is required', refused: true });
    // Still the value shown for the site, until it changes.
    expect(queue.holds('site')).toBe(true);
    expect(queue.valueOf('site')).toEqual({ name: '' });
    expect(queue.busy()).toBe(true);
  });

  it('the next change of a refused resource is saved normally and clears the error', async () => {
    let refuse = true;
    const { queue, saved } = makeQueue(async key => {
      if (key === 'site' && refuse) throw Object.assign(new Error('site.name is required'), { status: 400 });
    });
    queue.set('site', { name: '' });
    await queue.flush();
    refuse = false;
    queue.set('site', { name: 'D' });
    await queue.flush();
    expect(saved).toEqual([['site', { name: 'D' }]]);
    expect(queue.getState().error).toBeNull();
    expect(queue.busy()).toBe(false);
  });

  it('any other failure (network, session, server) keeps its place and stops the saves after it', async () => {
    const { queue, saved } = makeQueue(async key => {
      if (key === 'site') throw Object.assign(new Error('HTTP 503'), { status: 503 });
    });
    queue.set('site', { name: 'D' });
    queue.set('albums', 'renamed');
    await queue.flush();
    expect(saved).toEqual([]);
    expect(queue.getState().error).toEqual({ key: 'site', message: 'HTTP 503', refused: false });
    expect(queue.getState().pending).toBe(2);
  });

  it('clear() also forgets a refused value', async () => {
    const { queue } = makeQueue(async () => { throw Object.assign(new Error('bad'), { status: 400 }); });
    queue.set('site', { name: '' });
    await queue.flush();
    queue.clear();
    expect(queue.holds('site')).toBe(false);
    expect(queue.busy()).toBe(false);
  });

  it('only the answers that say the value is wrong are refusals', async () => {
    for (const status of [400, 413, 415, 422]) {
      const { queue } = makeQueue(async () => { throw Object.assign(new Error('bad'), { status }); });
      queue.set('site', 1);
      await queue.flush();
      expect(queue.getState().error.refused, String(status)).toBe(true);
    }
    // A network failure (0), an expired session (401, 403) or the server (500) may work on Retry.
    for (const status of [0, 401, 403, 500]) {
      const { queue } = makeQueue(async () => { throw Object.assign(new Error('try again'), { status }); });
      queue.set('site', 1);
      await queue.flush();
      expect(queue.getState().error.refused, String(status)).toBe(false);
      expect(queue.getState().pending).toBe(1);
    }
  });

  it('a refused value stays the error shown after another error comes and goes', async () => {
    let albumsDown = true;
    const { queue } = makeQueue(async key => {
      if (key === 'site') throw Object.assign(new Error('site.name is required'), { status: 400 });
      if (key === 'albums' && albumsDown) throw Object.assign(new Error('NETWORK'), { status: 0 });
    });
    queue.set('site', { name: '' });
    queue.set('albums', 'renamed');
    await queue.flush();
    expect(queue.getState().error).toEqual({ key: 'albums', message: 'NETWORK', refused: false });
    albumsDown = false;
    await queue.flush();
    expect(queue.getState().error).toEqual({ key: 'site', message: 'site.name is required', refused: true });
  });

  it('of two refused values, fixing one shows the other', async () => {
    const { queue } = makeQueue(async (key, value) => {
      if (value === 'bad') throw Object.assign(new Error(`${key} is wrong`), { status: 400 });
    });
    queue.set('site', 'bad');
    queue.set('albums', 'bad');
    await queue.flush();
    expect(queue.getState().error.key).toBe('albums');
    queue.set('albums', 'good');
    await queue.flush();
    expect(queue.getState().error).toEqual({ key: 'site', message: 'site is wrong', refused: true });
  });

  it('changing a refused value takes its message away at once, before it is saved', async () => {
    const { queue } = makeQueue(async (key, value) => {
      if (value === 'bad') throw Object.assign(new Error('wrong'), { status: 400 });
    });
    queue.set('site', 'bad');
    await queue.flush();
    queue.set('site', 'good');
    expect(queue.getState().error).toBeNull();
    expect(queue.getState().pending).toBe(1);
  });
});

