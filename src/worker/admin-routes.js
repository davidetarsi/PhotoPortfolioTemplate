/**
 * Admin (authenticated) write handlers.
 * JWT is verified HERE (not in the worker router): every admin handler is
 * closed by construction even if routing changes.
 */
import { jsonResponse } from './http.js';
import { verifyAccessJwt } from './access-jwt.js';
import {
  SLUG_RE, PHOTO_NAME_RE, MAX_PHOTO_BYTES,
  validateSiteShape, validateAlbumsShape, validateManifestShape,
} from '../shared/content-rules.js';

const MANIFEST_RE = /^\/api\/admin\/albums\/([a-z0-9][a-z0-9-]*)\/manifest$/;
const PHOTO_RE = /^\/api\/admin\/albums\/([a-z0-9][a-z0-9-]*)\/photos\/([^/]+)$/;
const MESSAGE_ID_RE = /^[A-Za-z0-9-]+$/;
const MESSAGES_PREFIX = '_messages/';

async function readJson(request) {
  try { return { ok: true, data: await request.json() }; }
  catch { return { ok: false }; }
}

async function putValidatedJson(request, env, key, validate) {
  const body = await readJson(request);
  if (!body.ok) return jsonResponse({ error: 'JSON malformato' }, 400);
  const check = validate(body.data);
  if (!check.ok) return jsonResponse({ error: check.error }, 400);
  try {
    await env.BUCKET.put(key, JSON.stringify(body.data), { httpMetadata: { contentType: 'application/json' } });
  } catch {
    return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
  }
  return jsonResponse({ ok: true });
}

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
  const { method } = request;

  if (pathname === '/api/admin/site') {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    return putValidatedJson(request, env, '_site/site.json', validateSiteShape);
  }

  if (pathname === '/api/admin/albums') {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    return putValidatedJson(request, env, '_data/albums.json', validateAlbumsShape);
  }

  const manifest = pathname.match(MANIFEST_RE);
  if (manifest) {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const slug = manifest[1];
    if (!SLUG_RE.test(slug)) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    return putValidatedJson(request, env, `${slug}/manifest.json`, validateManifestShape);
  }

  const photo = pathname.match(PHOTO_RE);
  if (photo) {
    const [, slug, rawName] = photo;
    const name = decodeURIComponent(rawName);
    if (!SLUG_RE.test(slug) || !PHOTO_NAME_RE.test(name)) {
      return jsonResponse({ error: 'Nome o slug invalido' }, 400);
    }
    const key = `${slug}/${name}`;

    if (method === 'PUT') {
      if (request.headers.get('Content-Type') !== 'image/webp') return jsonResponse({ error: 'Atteso image/webp' }, 415);
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > MAX_PHOTO_BYTES) return jsonResponse({ error: 'File oltre 10MB' }, 413);
      if (bytes.byteLength === 0) return jsonResponse({ error: 'Body vuoto' }, 400);
      try {
        await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
      } catch {
        return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
      }
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE') {
      try {
        await env.BUCKET.delete(key);
        const manifestObj = await env.BUCKET.get(`${slug}/manifest.json`);
        if (manifestObj) {
          const entries = await manifestObj.json();
          if (Array.isArray(entries)) {
            const filtered = entries.filter(e => e?.name !== name);
            await env.BUCKET.put(`${slug}/manifest.json`, JSON.stringify(filtered), {
              httpMetadata: { contentType: 'application/json' },
            });
          }
        }
      } catch {
        return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const albumDelete = pathname.match(/^\/api\/admin\/albums\/([a-z0-9][a-z0-9-]*)$/);
  if (albumDelete) {
    if (method !== 'DELETE') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const slug = albumDelete[1];

    // Paginated loop: list() returns max 1000 keys/page, delete() takes max 1000 keys/call.
    // Delete photos first, THEN albums.json: if the loop dies halfway, the album
    // stays visible in the dashboard and the delete is re-runnable (idempotent).
    try {
      let cursor;
      do {
        const page = await env.BUCKET.list({ prefix: `${slug}/`, cursor, limit: 1000 });
        if (page.objects.length > 0) await env.BUCKET.delete(page.objects.map(o => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);

      const albumsObj = await env.BUCKET.get('_data/albums.json');
      if (albumsObj) {
        const data = await albumsObj.json();
        if (data && Array.isArray(data.albums)) {
          const filtered = { albums: data.albums.filter(a => a?.slug !== slug) };
          await env.BUCKET.put('_data/albums.json', JSON.stringify(filtered), {
            httpMetadata: { contentType: 'application/json' },
          });
        }
      }
    } catch {
      return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
    }
    return jsonResponse({ ok: true });
  }

  const isMessageRoute = pathname === '/api/admin/messages' || pathname.startsWith('/api/admin/messages/');
  // Messages live only in the private bucket: never read the public photo bucket for them.
  if (isMessageRoute && !env.MESSAGES_BUCKET) return jsonResponse({ error: 'STORAGE_UNAVAILABLE' }, 500);

  if (pathname === '/api/admin/messages' && request.method === 'GET') {
    // list() returns at most 1000 keys per page: follow the cursor to the end.
    const objects = [];
    let cursor;
    do {
      const page = await env.MESSAGES_BUCKET.list({ prefix: MESSAGES_PREFIX, cursor });
      objects.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    const messages = [];
    for (const { key } of objects) {
      const obj = await env.MESSAGES_BUCKET.get(key);
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
    await env.MESSAGES_BUCKET.delete(`${MESSAGES_PREFIX}${id}.json`);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'NOT_FOUND' }, 404);
}
