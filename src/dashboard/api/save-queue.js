/**
 * The draft's autosave. Every change is queued under the resource it touches ('albums',
 * 'manifest:<slug>', later 'site'); only the latest value of each resource is kept, and
 * the queue saves them 800 ms after the last change, in the order they were first queued
 * (an album is created before its manifest is written).
 *
 * Two rules tie it to publishing (spec, "Da portare nei piani 4.2–4.4"):
 * - before publishing, `flush()` saves what is waiting, so the draft published is complete;
 * - while publishing, the queue is `paused`: changes are kept in memory, not saved, and are
 *   saved once `resume()` is called — never lost, never written during the publication.
 *
 * Plain JavaScript (no React): src/dashboard/api/drafts.jsx connects it to the screens.
 */

/** Wait after the last change before saving. */
export const SAVE_DELAY_MS = 800;

/**
 * @param {{save: (key: string, value: any) => Promise<void>, delay?: number,
 *   onSaved?: (key: string) => void}} options
 */
export function createSaveQueue({ save, delay = SAVE_DELAY_MS, onSaved }) {
  const pending = new Map(); // key → latest value, in first-queued order
  const listeners = new Set();
  let saving = false;
  let paused = false;
  let error = null; // { key, message }
  let timer = null;
  let running = null; // the promise of the flush in progress
  let state = { pending: 0, saving: false, paused: false, error: null };

  const notify = () => {
    state = { pending: pending.size, saving, paused, error };
    for (const listener of listeners) listener();
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = paused ? null : setTimeout(() => { flush(); }, delay);
  };

  async function run() {
    saving = true;
    notify();
    try {
      while (pending.size > 0 && !paused) {
        const [key, value] = pending.entries().next().value;
        pending.delete(key);
        try {
          await save(key, value);
          error = null;
          onSaved?.(key);
        } catch (e) {
          // Keep the change for the next try, unless a newer one arrived meanwhile.
          if (!pending.has(key)) pending.set(key, value);
          error = { key, message: e?.message ?? String(e) };
          return;
        }
      }
    } finally {
      saving = false;
      notify();
    }
  }

  /** Saves everything waiting now. Resolves when done (or at the first error). */
  function flush() {
    clearTimeout(timer);
    timer = null;
    if (paused) return Promise.resolve();
    if (!running) running = run().finally(() => { running = null; });
    return running.then(() => (pending.size > 0 && !paused && !error ? flush() : undefined));
  }

  return {
    /** Queues the latest value of a resource; saved after the delay, or now with { now: true }. */
    set(key, value, { now = false } = {}) {
      pending.set(key, value); // an existing key keeps its place in the order
      notify();
      if (now) flush(); else schedule();
    },
    flush,
    /** Holds every save (a publication is running). Changes keep accumulating. */
    pause() {
      paused = true;
      clearTimeout(timer);
      timer = null;
      notify();
    },
    /** Saves again, starting with what accumulated while paused. */
    resume() {
      paused = false;
      notify();
      if (pending.size > 0) schedule();
    },
    /** Drops what is waiting (the draft is being discarded). A save already running finishes. */
    clear() {
      clearTimeout(timer);
      timer = null;
      pending.clear();
      error = null;
      notify();
    },
    /** Resolves once no save is running. */
    whenIdle: () => running ?? Promise.resolve(),
    /** True while something is waiting or being saved: the screens must not overwrite it. */
    busy: () => pending.size > 0 || saving,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
