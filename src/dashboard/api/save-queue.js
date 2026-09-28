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
 * A save the Worker refuses (the value is not valid: 400, 413, 415, 422) would fail again
 * unchanged, so it is set aside instead of kept first in line: the other resources go on
 * saving, the refused value stays on screen with the Worker's reason, and the next change
 * of that resource is saved normally. While any value stays refused its reason is the error
 * shown (and publishing waits): another error that comes and goes never hides it. A save that failed for any other reason (network,
 * session expired, server error) keeps its place and blocks the ones after it until Retry.
 *
 * Plain JavaScript (no React).
 */

/** Wait after the last change before saving. */
export const SAVE_DELAY_MS = 800;

/** Answers that say the value itself is wrong: saving it again cannot work. */
const REFUSED = new Set([400, 413, 415, 422]);
const isRefusal = e => REFUSED.has(e?.status);

/**
 * @param {{save: (key: string, value: any) => Promise<void>, delay?: number,
 *   onSaved?: (key: string) => void}} options
 */
export function createSaveQueue({ save, delay = SAVE_DELAY_MS, onSaved }) {
  let pending = new Map(); // key → latest value, in first-queued order
  const listeners = new Set();
  let inFlight = null; // { key, value } being saved
  let paused = false;
  let error = null; // { key, message, refused }
  const refused = new Map(); // key → { value, message } the Worker refused, until the next change of it
  let timer = null;
  let running = null; // the promise of the flush in progress
  let generation = 0; // bumped by clear(): a save started before it is not put back
  let state = { pending: 0, saving: false, paused: false, error: null };

  // The reason of a value still refused, once no other error is shown.
  const refusedError = () => {
    const first = refused.entries().next().value;
    return first ? { key: first[0], message: first[1].message, refused: true } : null;
  };
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
        if (error?.key === key) error = refusedError();
        onSaved?.(key);
      } catch (e) {
        if (started !== generation) return;
        if (isRefusal(e)) {
          // Set aside, unless a newer value arrived meanwhile: the others keep saving.
          const message = e?.message ?? String(e);
          if (!pending.has(key)) refused.set(key, { value, message });
          error = { key, message, refused: true };
          continue;
        }
        // Keep the change, first in line, unless a newer one arrived meanwhile.
        if (!pending.has(key)) pending = new Map([[key, value], ...pending]);
        error = { key, message: e?.message ?? String(e), refused: false };
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
      refused.delete(key); // a new value gets its own chance
      if (error?.refused && error.key === key) error = refusedError();
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
      refused.clear();
      generation += 1;
      error = null;
      notify();
    },
    /** Resolves once no save is running. */
    whenIdle: () => running ?? Promise.resolve(),
    /** True while something is not saved (waiting, being saved, refused): the screens must not overwrite it. */
    busy: () => pending.size > 0 || inFlight !== null || refused.size > 0,
    /** True when this resource has a value that is not saved: waiting, being saved or refused. */
    holds: key => pending.has(key) || inFlight?.key === key || refused.has(key),
    /** The value waiting (else being saved, else refused) for this resource, or undefined. */
    valueOf: key => (pending.has(key) ? pending.get(key)
      : inFlight?.key === key ? inFlight.value
        : refused.get(key)?.value),
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
