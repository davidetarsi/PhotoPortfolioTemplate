/**
 * The draft's autosave. Every change is queued under the resource it touches ('albums',
 * 'manifest:<slug>', later 'site'); only the latest value of each resource is kept, and
 * the queue saves them 800 ms after the last change, in the order they were first queued
 * (an album is created before its manifest is written; a save that fails keeps its place).
 *
 * The queue is the truth for what is not saved yet: `valueOf(key)` gives the value waiting
 * or being saved, and src/dashboard/api/drafts.jsx lays it over every answer of the server,
 * so a refetch never shows (or brings back) an older version.
 *
 * Two rules tie it to publishing (spec, "Da portare nei piani 4.2–4.4"):
 * - before publishing, `flush()` saves what is waiting, so the draft published is complete;
 * - while publishing, the queue is `paused`: changes are kept in memory, not saved, and are
 *   saved once `resume()` is called — never lost, never written during the publication.
 * `clear()` drops what waits (the draft is being discarded): a save already running that
 * fails afterwards is not brought back.
 *
 * Plain JavaScript (no React).
 */

/** Wait after the last change before saving. */
export const SAVE_DELAY_MS = 800;

/**
 * @param {{save: (key: string, value: any) => Promise<void>, delay?: number,
 *   onSaved?: (key: string) => void}} options
 */
export function createSaveQueue({ save, delay = SAVE_DELAY_MS, onSaved }) {
  let pending = new Map(); // key → latest value, in first-queued order
  const listeners = new Set();
  let inFlight = null; // { key, value } being saved
  let paused = false;
  let error = null; // { key, message }
  let timer = null;
  let running = null; // the promise of the flush in progress
  let generation = 0; // bumped by clear(): a save started before it is not put back
  let state = { pending: 0, saving: false, paused: false, error: null };

  const notify = () => {
    state = { pending: pending.size, saving: inFlight !== null, paused, error };
    for (const listener of listeners) listener();
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = paused ? null : setTimeout(() => { flush(); }, delay);
  };

  async function run() {
    while (pending.size > 0 && !paused) {
      const [key, value] = pending.entries().next().value;
      pending.delete(key);
      inFlight = { key, value };
      const started = generation;
      notify();
      try {
        await save(key, value);
        if (error?.key === key) error = null;
        onSaved?.(key);
      } catch (e) {
        if (started === generation) {
          // Keep the change, first in line, unless a newer one arrived meanwhile.
          if (!pending.has(key)) pending = new Map([[key, value], ...pending]);
          error = { key, message: e?.message ?? String(e) };
        }
        return;
      } finally {
        inFlight = null;
        notify();
      }
    }
  }

  /** Saves everything waiting now. Resolves when done (or at the first error). */
  function flush() {
    clearTimeout(timer);
    timer = null;
    if (paused) return Promise.resolve();
    if (!running) running = run().finally(() => { running = null; });
    return running.then(() => (pending.size > 0 && !paused && !(error && pending.has(error.key)) ? flush() : undefined));
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
      generation += 1;
      error = null;
      notify();
    },
    /** Resolves once no save is running. */
    whenIdle: () => running ?? Promise.resolve(),
    /** True while something is waiting or being saved: the screens must not overwrite it. */
    busy: () => pending.size > 0 || inFlight !== null,
    /** True when this resource has a value waiting or being saved. */
    holds: key => pending.has(key) || inFlight?.key === key,
    /** The value waiting (else being saved) for this resource, or undefined. */
    valueOf: key => (pending.has(key) ? pending.get(key) : inFlight?.key === key ? inFlight.value : undefined),
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Stops the timer (the provider is gone). */
    dispose() {
      clearTimeout(timer);
      timer = null;
      listeners.clear();
    },
  };
}
