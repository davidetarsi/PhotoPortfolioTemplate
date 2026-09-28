/**
 * TanStack Query hooks for the draft and the publication. Screens read with these hooks
 * and never call fetch themselves.
 */
import { useContext } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, request } from './client.js';
import { SaveQueueContext } from './save-context.js';

/** Steps in a row without fewer photos left: the publication is stuck, stop asking. */
export const MAX_STEPS_WITHOUT_PROGRESS = 3;

// Every query about the draft has a key starting with 'draft': a publication or a discard
// refreshes exactly those (the messages, for example, are not touched).
export const keys = Object.freeze({
  draft: ['draft'],
  status: ['draft-status'],
  manifest: slug => ['draft-manifest', slug],
});
const isDraftQuery = query => String(query.queryKey[0]).startsWith('draft');

/** The draft's site and album list ({ site, albums, hasDraft }). */
export function useDraft() {
  // Never refetched over changes still waiting to be saved (see drafts.jsx).
  const queue = useContext(SaveQueueContext);
  return useQuery({ queryKey: keys.draft, queryFn: () => request('/api/admin/draft'), refetchOnWindowFocus: () => !queue?.busy() });
}

/** What publishing would change ({ hasDraft, publishing, changes }). */
export function useDraftStatus() {
  return useQuery({ queryKey: keys.status, queryFn: () => request('/api/admin/draft/status') });
}

/** Everything that depends on the draft is read again. */
function useRefreshDraft() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ predicate: isDraftQuery });
}

/**
 * Publishes in steps: calls POST /api/admin/publish until it says done, reporting the
 * photos left after each step. A 409 with problems rejects with them in error.body.
 * @param {{onStep?: (step: {copied: number, remaining: number}) => void}} [options]
 */
export function usePublish({ onStep } = {}) {
  const refresh = useRefreshDraft();
  return useMutation({
    mutationKey: ['publish'],
    mutationFn: async () => {
      let best = Infinity;
      let stalled = 0;
      for (;;) {
        const step = await request('/api/admin/publish', { method: 'POST' });
        onStep?.(step);
        if (step.done) return step;
        if (step.remaining < best) {
          best = step.remaining;
          stalled = 0;
        } else if (++stalled >= MAX_STEPS_WITHOUT_PROGRESS) {
          throw new ApiError(0, { error: 'NO_PROGRESS' });
        }
      }
    },
    onSettled: refresh,
  });
}

/** Deletes the draft and the waiting photos. Refused (409) once a publication started. */
export function useDiscard() {
  const refresh = useRefreshDraft();
  return useMutation({
    mutationKey: ['discard'],
    mutationFn: () => request('/api/admin/draft', { method: 'DELETE' }),
    onSettled: refresh,
  });
}

/**
 * True while a publication runs. Saving the draft and uploading photos must wait:
 * the publication's close removes the draft files it started from (spec, plan-2 rules).
 */
export function useIsPublishing() {
  return useIsMutating({ mutationKey: ['publish'] }) > 0;
}
