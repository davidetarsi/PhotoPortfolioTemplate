import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, request } from './client.js';

/** Query key for the administrator's private contact messages. */
export const messages = ['messages'];

/** @returns {import('@tanstack/react-query').UseQueryResult<Array<object>, Error>} */
export function useMessages() {
  return useQuery({
    queryKey: messages,
    queryFn: async () => {
      const body = await request('/api/admin/messages');
      if (!Array.isArray(body?.messages)) {
        throw new ApiError(200, { error: 'INVALID_MESSAGES_RESPONSE' });
      }
      return body.messages;
    },
    retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 1,
  });
}

/** Delete one message and refresh the list after the Worker confirms it. */
export function useDeleteMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: id => request(`/api/admin/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: messages }),
  });
}
