import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fakeMatchMedia(initial) {
  const listeners = new Set();
  const list = { matches: initial, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  vi.stubGlobal('matchMedia', () => list);
  return { set(value) { list.matches = value; for (const fn of listeners) fn(); }, listeners };
}

describe('useMediaQuery', () => {
  it('follows the media query as it changes', () => {
    const media = fakeMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 900px)'));
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
