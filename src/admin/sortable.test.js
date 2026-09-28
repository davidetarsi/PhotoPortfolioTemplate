import { describe, it, expect, vi } from 'vitest';
import { attachSortable, moveItem } from './sortable.js';

describe('moveItem', () => {
  it('sposta un elemento senza mutare l\'originale', () => {
    const arr = ['a', 'b', 'c', 'd'];
    expect(moveItem(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(arr, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(arr).toEqual(['a', 'b', 'c', 'd']);
  });
  it('indici uguali o fuori range → copia invariata', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('attachSortable', () => {
  it('reports moves, and stops when its signal is aborted', () => {
    const list = document.createElement('ul');
    list.innerHTML = '<li draggable="true">a</li><li draggable="true">b</li>';
    const onMove = vi.fn();
    const controller = new AbortController();
    attachSortable(list, onMove, controller.signal);
    const [a, b] = list.children;
    a.dispatchEvent(new Event('dragstart', { bubbles: true }));
    b.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(onMove).toHaveBeenCalledWith(0, 1);
    controller.abort();
    a.dispatchEvent(new Event('dragstart', { bubbles: true }));
    b.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('a drop on what is inside an item (an image not draggable on its own) counts as that item', () => {
    const list = document.createElement('ul');
    list.innerHTML = '<li draggable="true"><a draggable="false"><img draggable="false"></a></li><li draggable="true"><a draggable="false"><img draggable="false"></a></li>';
    const onMove = vi.fn();
    attachSortable(list, onMove);
    list.children[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    list.querySelectorAll('img')[1].dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(onMove).toHaveBeenCalledWith(0, 1);
  });
});
