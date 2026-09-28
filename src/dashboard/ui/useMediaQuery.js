import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches now, following its changes (a window resized, a
 * phone turned).
 * @param {string} query - e.g. '(min-width: 900px)'.
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const subscribe = onChange => {
    const list = window.matchMedia?.(query);
    list?.addEventListener?.('change', onChange);
    return () => list?.removeEventListener?.('change', onChange);
  };
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false, () => false);
}
