const listeners = new Map();

export function on(type, listener) {
  if (typeof listener !== 'function') throw new TypeError('Event listener must be a function.');
  let group = listeners.get(type);
  if (!group) listeners.set(type, group = new Set());
  group.add(listener);
  return () => {
    group.delete(listener);
    if (group.size === 0) listeners.delete(type);
  };
}

export function emit(type, detail) {
  for (const listener of [...(listeners.get(type) ?? [])]) {
    try {
      listener(detail);
    } catch (error) {
      console.error(`Event listener for "${type}" failed.`, error);
    }
  }
}

// Kept out of the public API; tests use it to isolate the module singleton.
export function reset() {
  listeners.clear();
}
