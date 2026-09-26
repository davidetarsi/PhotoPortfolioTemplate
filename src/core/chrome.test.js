import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountChrome } from './chrome.js';
import { createPageLifecycle } from './page.js';

const mocked = vi.hoisted(() => ({ slot: vi.fn() }));
vi.mock('./custom-slots.js', () => ({ slot: mocked.slot }));

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

describe('mountChrome', () => {
  beforeEach(() => {
    mocked.slot.mockReset();
    document.body.innerHTML = '<nav id="site-nav"></nav><footer id="site-footer"></footer>';
  });

  it('mounts a fast footer while the nav loader is still pending', async () => {
    const navLoad = deferred();
    const footerMount = vi.fn();
    const navMount = vi.fn();
    mocked.slot.mockImplementation(name => name === 'nav'
      ? navLoad.promise
      : Promise.resolve({ mount: footerMount }));
    const owner = createPageLifecycle({ target: new EventTarget() })('home');

    const complete = mountChrome({ site: { name: 'Test', social: {} }, texts: {}, owner });
    await Promise.resolve();
    await Promise.resolve();

    expect(footerMount).toHaveBeenCalledOnce();
    expect(navMount).not.toHaveBeenCalled();
    navLoad.resolve({ mount: navMount });
    await complete;

    expect(navMount).toHaveBeenCalledOnce();
  });

  it('logs a failing footer while a successful nav still mounts', async () => {
    const navMount = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocked.slot.mockImplementation(name => name === 'footer'
      ? Promise.reject(new Error('footer unavailable'))
      : Promise.resolve({ mount: navMount }));
    const owner = createPageLifecycle({ target: new EventTarget() })('home');

    await mountChrome({ site: { name: 'Test', social: {} }, texts: {}, owner });

    expect(navMount).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
