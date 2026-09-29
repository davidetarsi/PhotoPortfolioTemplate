import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDeleteMessage, useMessages } from './messages.js';
import { fakeWorker, makeQueryClient, Providers } from '../test-utils.jsx';

const wrapper = client => ({ children }) => <Providers client={client}>{children}</Providers>;

describe('message queries', () => {
  it('loads messages from the private admin route', async () => {
    const messages = [{ id: 'one', name: 'Ada', email: 'ada@example.test', message: 'Hello', receivedAt: 1 }];
    const fetchMock = fakeWorker({ 'GET /api/admin/messages': { messages } });
    const { result } = renderHook(() => useMessages(), { wrapper: wrapper(makeQueryClient()) });

    await waitFor(() => expect(result.current.data).toEqual(messages));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/messages', expect.objectContaining({ method: 'GET' }));
  });

  it('deletes a message and invalidates the messages query', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/messages': [{ messages: [{ id: 'one' }] }, { messages: [] }],
      'DELETE /api/admin/messages/one': { ok: true },
    });
    const client = makeQueryClient();
    const { result } = renderHook(() => ({ messages: useMessages(), remove: useDeleteMessage() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.messages.data).toEqual([{ id: 'one' }]));

    await act(() => result.current.remove.mutateAsync('one'));

    await waitFor(() => expect(result.current.messages.data).toEqual([]));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/messages/one', expect.objectContaining({ method: 'DELETE' }));
  });
});
