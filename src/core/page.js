import * as defaultBus from './events.js';

function report(error, context) {
  console.error(`${context} failed.`, error);
}

export function createPageLifecycle({ setup, bus = defaultBus, target = globalThis.window } = {}) {
  const pages = new Map();

  function start(page) {
    if (pages.has(page)) return pages.get(page);

    const cleanups = new Set();
    const destroyedHandles = new WeakSet();
    let destroyed = false;
    let lastReadyDetail;
    let persisted = false;

    const disposeHandle = handle => {
      if (!handle || (typeof handle !== 'object' && typeof handle !== 'function')) return;
      if (destroyedHandles.has(handle)) return;
      destroyedHandles.add(handle);
      if (typeof handle.destroy === 'function') {
        try {
          handle.destroy();
        } catch (error) {
          report(error, `Cleanup for page "${page}"`);
        }
      }
    };

    const addCleanup = cleanup => {
      if (typeof cleanup !== 'function') return;
      if (destroyed) {
        try { cleanup(); } catch (error) { report(error, `Setup cleanup for page "${page}"`); }
      } else {
        cleanups.add(cleanup);
      }
    };

    const owner = {
      get destroyed() { return destroyed; },
      track(handleOrPromise) {
        if (handleOrPromise && typeof handleOrPromise.then === 'function') {
          return Promise.resolve(handleOrPromise).then(
            handle => {
              if (destroyed) disposeHandle(handle);
              else if (handle && typeof handle === 'object') cleanups.add(() => disposeHandle(handle));
              return handle;
            },
            error => {
              report(error, `Mount for page "${page}"`);
              return undefined;
            },
          );
        }
        if (destroyed) disposeHandle(handleOrPromise);
        else if (handleOrPromise && typeof handleOrPromise === 'object') cleanups.add(() => disposeHandle(handleOrPromise));
        return handleOrPromise;
      },
      ready(detail = {}) {
        if (destroyed) return;
        lastReadyDetail = { page, ...detail };
        bus.emit('page:ready', lastReadyDetail);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        target?.removeEventListener?.('pagehide', onPageHide);
        target?.removeEventListener?.('pageshow', onPageShow);
        for (const cleanup of [...cleanups].reverse()) {
          try { cleanup(); } catch (error) { report(error, `Cleanup for page "${page}"`); }
        }
        cleanups.clear();
      },
    };

    function onPageHide(event) {
      persisted = event.persisted === true;
      bus.emit('page:leave', { page, persisted });
      if (!persisted) owner.destroy();
    }

    function onPageShow(event) {
      if (event.persisted === true && persisted && lastReadyDetail) {
        persisted = false;
        bus.emit('page:ready', { ...lastReadyDetail, restored: true });
      }
    }

    pages.set(page, owner);
    target?.addEventListener?.('pagehide', onPageHide);
    target?.addEventListener?.('pageshow', onPageShow);
    if (typeof setup === 'function') {
      try {
        const result = setup({ page, on: bus.on, emit: bus.emit });
        if (result && typeof result.then === 'function') {
          result.then(addCleanup, error => report(error, `Setup for page "${page}"`));
        } else addCleanup(result);
      } catch (error) {
        report(error, `Setup for page "${page}"`);
      }
    }
    return owner;
  }

  return start;
}

const setupModules = import.meta.glob('/custom/setup.js', { eager: true });
const setupModule = Object.values(setupModules)[0];
const startDefaultPage = createPageLifecycle({
  setup: typeof setupModule?.default === 'function' ? setupModule.default : undefined,
});

export function startPage(page) {
  return startDefaultPage(page);
}
