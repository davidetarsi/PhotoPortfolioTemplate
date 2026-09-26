import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPageLifecycle } from './page.js';
import { on, reset } from './events.js';

function pageTarget() {
  return new EventTarget();
}

afterEach(() => reset());

describe('page lifecycle owner', () => {
  it('starts each page once and destroys tracked handles once', async () => {
    const setup = vi.fn();
    const start = createPageLifecycle({ setup, target: pageTarget() });
    const owner = start('home');
    const destroy = vi.fn();
    owner.track({ destroy });

    expect(start('home')).toBe(owner);
    expect(setup).toHaveBeenCalledOnce();
    owner.destroy();
    owner.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('runs setup cleanup and continues after a cleanup throws', () => {
    const first = vi.fn(() => { throw new Error('cleanup failed'); });
    const second = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const start = createPageLifecycle({ setup: () => () => first(), target: pageTarget() });
    const owner = start('about');
    owner.track({ destroy: second });

    owner.destroy();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('emits leave on persisted pagehide and ready on restoration without disposing', () => {
    const target = pageTarget();
    const start = createPageLifecycle({ target });
    const owner = start('home');
    const destroy = vi.fn();
    const ready = vi.fn();
    const leave = vi.fn();
    owner.track({ destroy });
    owner.ready({ page: 'home', site: { name: 'Test' } });
    on('page:ready', ready);
    on('page:leave', leave);

    const hide = new Event('pagehide');
    Object.defineProperty(hide, 'persisted', { value: true });
    target.dispatchEvent(hide);
    const show = new Event('pageshow');
    Object.defineProperty(show, 'persisted', { value: true });
    target.dispatchEvent(show);

    expect(leave).toHaveBeenCalledWith({ page: 'home', persisted: true });
    expect(ready).toHaveBeenCalledWith({ page: 'home', site: { name: 'Test' }, restored: true });
    expect(destroy).not.toHaveBeenCalled();
  });

  it('destroys on non-persisted pagehide and unregisters lifecycle listeners', () => {
    const target = pageTarget();
    const start = createPageLifecycle({ target });
    const owner = start('album');
    const destroy = vi.fn();
    owner.track({ destroy });

    target.dispatchEvent(new Event('pagehide'));
    target.dispatchEvent(new Event('pagehide'));

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('disposes a mount handle that resolves after its owner leaves', async () => {
    const start = createPageLifecycle({ target: pageTarget() });
    const owner = start('home');
    let resolve;
    const mounting = new Promise(r => { resolve = r; });
    const destroy = vi.fn();
    owner.track(mounting);
    owner.destroy();
    resolve({ destroy });
    await mounting;
    await Promise.resolve();

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('consumes a rejected pending mount and logs it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const start = createPageLifecycle({ target: pageTarget() });
    const owner = start('home');
    owner.track(Promise.reject(new Error('mount failed')));
    await Promise.resolve();
    await Promise.resolve();

    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
