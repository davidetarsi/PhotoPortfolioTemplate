/**
 * Admin (authenticated) write handlers.
 * JWT is verified HERE (not in the worker router): every admin handler is
 * closed by construction even if routing changes.
 */
import { jsonResponse } from './http.js';
import { verifyAccessJwt } from './access-jwt.js';
import { handleDraftRequest } from './draft-routes.js';

const MESSAGE_ID_RE = /^[A-Za-z0-9-]+$/;
const MESSAGES_PREFIX = '_messages/';

/**
 * Handles authenticated admin API requests for managing site data and photos.
 * JWT is verified here, not in the router, so every admin handler is closed by construction.
 * @param {Request} request - The HTTP request object.
 * @param {Object} env - Cloudflare environment variables and bindings.
 * @param {Object} [deps] - Optional dependencies for testing.
 * @returns {Promise<Response>} HTTP response (JSON or error).
 */
export async function handleAdminRequest(request, env, deps = {}) {
  const auth = await verifyAccessJwt(request, env, deps);
  if (!auth.ok) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);

  const { pathname } = new URL(request.url);

  const draft = await handleDraftRequest(request, env, pathname);
  if (draft) return draft;

  const isMessageRoute = pathname === '/api/admin/messages' || pathname.startsWith('/api/admin/messages/');
  // Messages live only in the private bucket: never read the public photo bucket for them.
  if (isMessageRoute && !env.PRIVATE_BUCKET) return jsonResponse({ error: 'STORAGE_UNAVAILABLE' }, 500);

  if (pathname === '/api/admin/messages' && request.method === 'GET') {
    // list() returns at most 1000 keys per page: follow the cursor to the end.
    const objects = [];
    let cursor;
    do {
      const page = await env.PRIVATE_BUCKET.list({ prefix: MESSAGES_PREFIX, cursor });
      objects.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    const messages = [];
    for (const { key } of objects) {
      const obj = await env.PRIVATE_BUCKET.get(key);
      if (!obj) continue;
      messages.push({ id: key.slice(MESSAGES_PREFIX.length, -'.json'.length), ...(await obj.json()) });
    }
    // Keys are sortable by date: reversing them is enough, no need to check receivedAt.
    messages.reverse();
    return jsonResponse({ messages });
  }

  const delMsg = pathname.match(/^\/api\/admin\/messages\/(.+)$/);
  if (delMsg && request.method === 'DELETE') {
    const id = decodeURIComponent(delMsg[1]);
    // The ID becomes part of an R2 key. Without this regex check, an ID containing
    // slashes or dots could escape _messages/ and delete arbitrary objects.
    if (!MESSAGE_ID_RE.test(id)) return jsonResponse({ error: 'INVALID_ID' }, 400);
    await env.PRIVATE_BUCKET.delete(`${MESSAGES_PREFIX}${id}.json`);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'NOT_FOUND' }, 404);
}
