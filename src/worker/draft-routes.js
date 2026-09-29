/**
 * Dashboard routes for the draft: read and save it, photos waiting to be published,
 * what would change, discard, publish. Called by admin-routes.js after the Access check,
 * so every route here is already authenticated.
 */
import { jsonResponse } from './http.js';
import {
  SLUG_RE, PHOTO_NAME_RE, MAX_PHOTO_BYTES,
  validateSiteShape, validateAlbumsShape, validateManifestShape,
} from '../shared/content-rules.js';
import { PUBLISHED, DRAFT, STAGING, readJson, writeJson, deletePrefix, hasDraft, loadStates } from './draft-store.js';
import { diffDraft } from './draft-diff.js';
import { publishStep } from './publish.js';

const MANIFEST_RE = /^\/api\/admin\/draft\/albums\/([^/]+)\/manifest$/;
const STAGING_RE = /^\/api\/admin\/staging\/([^/]+)\/([^/]+)$/;
const PREVIEW_PHOTO_RE = /^\/api\/admin\/preview\/photo\/([^/]+)\/([^/]+)$/;

function decodePhotoName(slug, rawName) {
  let name;
  try { name = decodeURIComponent(rawName); } catch { return null; }
  return SLUG_RE.test(slug) && PHOTO_NAME_RE.test(name) ? name : null;
}

async function saveValidated(request, key, validate, env) {
  let data;
  try { data = await request.json(); } catch { return jsonResponse({ error: 'Malformed JSON' }, 400); }
  const check = validate(data);
  if (!check.ok) return jsonResponse({ error: check.error }, 400);
  try {
    await writeJson(env.PRIVATE_BUCKET, key, data);
  } catch {
    return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
  }
  return jsonResponse({ ok: true });
}

async function handleStaging(request, env, slug, name) {
  const key = STAGING.photo(slug, name);
  if (request.method === 'PUT') {
    if (request.headers.get('Content-Type') !== 'image/webp') return jsonResponse({ error: 'Expected image/webp' }, 415);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_PHOTO_BYTES) return jsonResponse({ error: 'File over 10MB' }, 413);
    if (bytes.byteLength === 0) return jsonResponse({ error: 'Empty body' }, 400);
    // A staged photo wins over the published one at publication: one with the name of a
    // published photo would be copied over it before the site stops naming it.
    const published = (await readJson(env.BUCKET, PUBLISHED.manifest(slug))) ?? [];
    if (published.some(entry => entry.name === name)) return jsonResponse({ error: 'NAME_PUBLISHED' }, 409);
    await env.PRIVATE_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
    return jsonResponse({ ok: true });
  }
  if (request.method === 'GET') {
    const obj = await env.PRIVATE_BUCKET.get(key);
    if (!obj) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    return new Response(obj.body, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' } });
  }
  if (request.method === 'DELETE') {
    await env.PRIVATE_BUCKET.delete(key);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
}

/**
 * An interrupted publication may have copied photos to the public bucket already.
 * Discarding the draft removes those that no published manifest names, so nothing
 * unpublished stays reachable.
 */
async function removeUnpublishedCopies(env) {
  const copied = (await readJson(env.PRIVATE_BUCKET, DRAFT.copied)) ?? [];
  const manifests = new Map();
  const orphans = [];
  for (const key of copied) {
    const slug = key.slice(0, key.indexOf('/'));
    const name = key.slice(key.indexOf('/') + 1);
    if (!manifests.has(slug)) manifests.set(slug, (await readJson(env.BUCKET, PUBLISHED.manifest(slug))) ?? []);
    if (!manifests.get(slug).some(entry => entry.name === name)) orphans.push(key);
  }
  for (let i = 0; i < orphans.length; i += 1000) await env.BUCKET.delete(orphans.slice(i, i + 1000));
}

/**
 * Handles a draft route, or returns null when the path is not one.
 * @param {Request} request - Already authenticated.
 * @param {object} env - Worker env with BUCKET and PRIVATE_BUCKET.
 * @param {string} pathname
 * @returns {Promise<Response|null>}
 */
export async function handleDraftRequest(request, env, pathname) {
  const isDraftRoute = pathname === '/api/admin/draft' || pathname.startsWith('/api/admin/draft/')
    || pathname.startsWith('/api/admin/staging/') || pathname === '/api/admin/publish'
    || pathname.startsWith('/api/admin/preview/');
  if (!isDraftRoute) return null;
  // The draft lives only in the private bucket: never fall back to the public one.
  if (!env.PRIVATE_BUCKET) return jsonResponse({ error: 'STORAGE_UNAVAILABLE' }, 500);
  const { method } = request;

  if (pathname === '/api/admin/draft') {
    if (method === 'GET') {
      const [draftSite, draftAlbums, pubSite, pubAlbums, pending] = await Promise.all([
        readJson(env.PRIVATE_BUCKET, DRAFT.site),
        readJson(env.PRIVATE_BUCKET, DRAFT.albums),
        readJson(env.BUCKET, PUBLISHED.site),
        readJson(env.BUCKET, PUBLISHED.albums),
        hasDraft(env),
      ]);
      const albums = (draftAlbums ?? pubAlbums)?.albums ?? [];
      let albumSummaries;
      try {
        albumSummaries = Object.fromEntries(await Promise.all(albums.map(async ({ slug }) => {
          const draftManifest = await readJson(env.PRIVATE_BUCKET, DRAFT.manifest(slug));
          const manifest = draftManifest ?? await readJson(env.BUCKET, PUBLISHED.manifest(slug)) ?? [];
          return [slug, { photoCount: manifest.length, firstPhoto: manifest[0]?.name ?? null }];
        })));
      } catch {
        return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
      }
      return jsonResponse({
        site: draftSite ?? pubSite,
        albums,
        albumSummaries,
        hasDraft: pending,
      });
    }
    if (method === 'DELETE') {
      // Past this note a publication has started overwriting the public site: discarding
      // now would leave it half-published. Finish it with "Publish" instead.
      if (await env.PRIVATE_BUCKET.get(DRAFT.cleanup)) return jsonResponse({ error: 'PUBLISH_IN_PROGRESS' }, 409);
      await removeUnpublishedCopies(env);
      await deletePrefix(env.PRIVATE_BUCKET, DRAFT.prefix);
      await deletePrefix(env.PRIVATE_BUCKET, STAGING.prefix);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  if (pathname === '/api/admin/draft/site') {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    return saveValidated(request, DRAFT.site, validateSiteShape, env);
  }

  if (pathname === '/api/admin/draft/albums') {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    return saveValidated(request, DRAFT.albums, validateAlbumsShape, env);
  }

  if (pathname === '/api/admin/draft/status') {
    if (method !== 'GET') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const { published, effective } = await loadStates(env);
    const [cleanup, copied] = await Promise.all([
      env.PRIVATE_BUCKET.get(DRAFT.cleanup),
      env.PRIVATE_BUCKET.get(DRAFT.copied),
    ]);
    return jsonResponse({
      hasDraft: await hasDraft(env),
      // A publication started and did not finish: the dashboard offers to resume it.
      publishing: Boolean(cleanup || copied),
      changes: diffDraft(published, effective),
    });
  }

  const manifest = pathname.match(MANIFEST_RE);
  if (manifest) {
    const slug = manifest[1];
    if (!SLUG_RE.test(slug)) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    if (method === 'GET') {
      const entries = (await readJson(env.PRIVATE_BUCKET, DRAFT.manifest(slug)))
        ?? (await readJson(env.BUCKET, PUBLISHED.manifest(slug))) ?? [];
      return jsonResponse(entries);
    }
    if (method === 'PUT') return saveValidated(request, DRAFT.manifest(slug), validateManifestShape, env);
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const staging = pathname.match(STAGING_RE);
  if (staging) {
    const slug = staging[1];
    const name = decodePhotoName(slug, staging[2]);
    if (!name) return jsonResponse({ error: 'Invalid name or slug' }, 400);
    return handleStaging(request, env, slug, name);
  }

  // Photos of the site preview: the waiting photo when there is one, else the published one.
  // Covers photos a stopped publication already moved out of the waiting area.
  const previewPhoto = pathname.match(PREVIEW_PHOTO_RE);
  if (previewPhoto) {
    if (method !== 'GET') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const slug = previewPhoto[1];
    const name = decodePhotoName(slug, previewPhoto[2]);
    if (!name) return jsonResponse({ error: 'Invalid name or slug' }, 400);
    const obj = (await env.PRIVATE_BUCKET.get(STAGING.photo(slug, name))) ?? (await env.BUCKET.get(PUBLISHED.photo(slug, name)));
    if (!obj) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    // The preview reloads after each save: the browser keeps the photo and asks whether it
    // changed (names can be reused, so it is never cached without asking).
    const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (obj.httpEtag) {
      headers.ETag = obj.httpEtag;
      if (request.headers.get('If-None-Match') === obj.httpEtag) return new Response(null, { status: 304, headers });
    }
    return new Response(obj.body, { headers });
  }

  if (pathname === '/api/admin/publish') {
    if (method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const result = await publishStep(env);
      if (result.problems) return jsonResponse({ error: 'PUBLISH_CHECK_FAILED', problems: result.problems }, 409);
      return jsonResponse(result);
    } catch {
      return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
    }
  }

  return jsonResponse({ error: 'NOT_FOUND' }, 404);
}
