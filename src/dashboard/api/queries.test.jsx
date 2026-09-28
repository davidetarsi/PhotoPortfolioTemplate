import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useIsPublishing, usePublish } from './queries.js';
import { makeQueryClient } from '../test-utils.jsx';

describe('useIsPublishing', () => {
  it('is true exactly while a publication runs: saves wait for it', async () => {
    let finish;
    // The Worker answers only when the test says so.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const client = makeQueryClient();
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({ publishing: useIsPublishing(), publish: usePublish() }), { wrapper });
    expect(result.current.publishing).toBe(false);
    act(() => { result.current.publish.mutate(); });
    await waitFor(() => expect(result.current.publishing).toBe(true));
    await act(async () => { finish(new Response(JSON.stringify({ done: true, copied: 0, remaining: 0 }), { status: 200 })); });
    await waitFor(() => expect(result.current.publishing).toBe(false));
  });
});
