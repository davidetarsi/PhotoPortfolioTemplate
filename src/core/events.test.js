import { afterEach, describe, expect, it, vi } from 'vitest';
import { emit, on, reset } from './events.js';

afterEach(() => reset());

describe('page event bus', () => {
  it('delivers listeners in registration order and unsubscribes independently', () => {
    const seen = [];
    on('page:ready', value => seen.push(`first:${value}`));
    const off = on('page:ready', value => seen.push(`second:${value}`));
    off();

    emit('page:ready', 'home');

    expect(seen).toEqual(['first:home']);
  });

  it('continues delivery when one listener throws', () => {
    const next = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    on('photo:open', () => { throw new Error('listener failed'); });
    on('photo:open', next);

    emit('photo:open', { index: 2 });

    expect(next).toHaveBeenCalledWith({ index: 2 });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
