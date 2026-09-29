// Minimal drag & drop for vertical lists. Reorder logic is pure (moveItem);
// DOM only emits (from, to).

/**
 * Moves an item in an array from one index to another.
 * @param {Array} arr - The array to reorder.
 * @param {number} from - Source index.
 * @param {number} to - Destination index.
 * @returns {Array} New array with the item moved, or original if indices are invalid.
 */
export function moveItem(arr, from, to) {
  const copy = [...arr];
  if (from === to || from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Attaches drag & drop functionality to a list element.
 * Calls onMove(from, to) when an item is dragged to a new position.
 * Children with draggable=true are sortable; what is inside them (a link, an image marked
 * draggable=false so that it is not dragged on its own) counts as its item.
 * @param {HTMLElement} listEl - The container element (typically ul or div).
 * @param {Function} onMove - Callback(fromIndex, toIndex) when item is moved.
 * @param {AbortSignal} [signal] - Aborting it removes the listeners.
 */
export function attachSortable(listEl, onMove, signal) {
  let fromIndex = null;
  const indexOf = el => [...listEl.children].indexOf(el.closest('[draggable="true"]'));
  listEl.addEventListener('dragstart', e => { fromIndex = indexOf(e.target); }, { signal });
  listEl.addEventListener('dragover', e => e.preventDefault(), { signal });
  listEl.addEventListener('drop', e => {
    e.preventDefault();
    const to = indexOf(e.target);
    if (fromIndex !== null && to !== -1 && to !== fromIndex) onMove(fromIndex, to);
    fromIndex = null;
  }, { signal });
}
