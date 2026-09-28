// Helpers for the dashboard's tests: a fresh query cache per test and a fake Worker
// answering the admin routes.
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, vi } from 'vitest';
import { SaveQueueProvider } from './api/drafts.jsx';

// Vitest runs without globals, so Testing Library cannot clean up by itself: unmount
// what each test rendered, and give back the real fetch that fakeWorker replaced.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** jsdom has no <dialog> methods: open and close by attribute, as the browser shows it. */
export function installDialogPolyfill() {
  const proto = globalThis.HTMLDialogElement?.prototype;
  if (!proto || proto.showModal) return;
  proto.showModal = function showModal() { this.setAttribute('open', ''); };
  proto.close = function close() { this.removeAttribute('open'); };
}

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** The providers of the dashboard (query cache and save queue) around a tree. */
export function Providers({ client, children }) {
  return (
    <QueryClientProvider client={client}>
      <SaveQueueProvider>{children}</SaveQueueProvider>
    </QueryClientProvider>
  );
}

/** Renders one component inside the dashboard's providers. */
export function renderWithQuery(ui, client = makeQueryClient()) {
  const result = render(<Providers client={client}>{ui}</Providers>);
  // Re-render inside the same providers (and the same queue).
  const rerender = next => result.rerender(<Providers client={client}>{next}</Providers>);
  return { client, ...result, rerender };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * A fake Worker: `routes` maps 'METHOD /path' to a body, a function of the request, or an
 * array of answers used in turn. Unknown routes answer 404. Returns the fetch mock.
 */
export function fakeWorker(answers) {
  const queues = new Map(Object.entries(answers).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
  const fetchMock = vi.fn(async (path, init = {}) => {
    const key = `${init.method ?? 'GET'} ${path}`;
    let answer = queues.get(key);
    if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
    if (answer === undefined) return json({ error: 'NOT_FOUND' }, 404);
    // A function answers the request; it may return a promise (an answer that arrives later).
    if (typeof answer === 'function') answer = await answer(init);
    if (answer instanceof Response) return answer;
    return answer?.status && answer.body !== undefined ? json(answer.body, answer.status) : json(answer);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
