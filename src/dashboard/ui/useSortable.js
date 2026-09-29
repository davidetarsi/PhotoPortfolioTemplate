import { useEffect, useRef } from 'react';
import { attachSortable } from '../lib/sortable.js';

/**
 * Drag and drop reordering of a container's children (the ones with draggable="true"):
 * `onMove(from, to)` is called with their indexes. Works with a mouse; on a phone the
 * screens also offer arrow buttons, since touch screens do not drag this way.
 * @param {(from: number, to: number) => void} onMove
 * @returns {import('react').RefObject<HTMLElement>} Attach it to the container.
 */
export function useSortable(onMove) {
  const ref = useRef(null);
  // The latest callback, without re-attaching the listeners on every render.
  const move = useRef(onMove);
  move.current = onMove;
  useEffect(() => {
    if (!ref.current) return undefined;
    const controller = new AbortController();
    attachSortable(ref.current, (from, to) => move.current(from, to), controller.signal);
    return () => controller.abort();
  }, []);
  return ref;
}
