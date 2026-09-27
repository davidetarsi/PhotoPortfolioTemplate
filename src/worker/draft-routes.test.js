// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { handleAdminRequest } from './admin-routes.js';
import { _resetJwksCache } from './access-jwt.js';
import { makeFakeBucket, makeFakeAssets, makeJwtTestKit } from './test-helpers.js';

const ENV_VARS = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123' };
const NOW = 1_800_000_000_000;
const SITE = { name: 'Davide', bio: '', hero: null, links: [] };
const ALBUM = { slug: 'notte', title: 'Notte', description: '', coverName: null };

let kit, deps, token;
beforeEach(async () => {
  _resetJwksCache();
  kit = await makeJwtTestKit();
  deps = { fetchJwks: kit.fetchJwks, now: () => NOW };
  token = await kit.signToken({
    aud: ['aud-123'], iss: 'https://team.cloudflareaccess.com',
    exp: Math.floor(NOW / 1000) + 3600, iat: Math.floor(NOW / 1000),
  });
});

const makeEnv = (published = {}, privateFiles = {}) => ({
  ...ENV_VARS, ASSETS: makeFakeAssets(), BUCKET: makeFakeBucket(published), PRIVATE_BUCKET: makeFakeBucket(privateFiles),
});
const call = (env, method, path, body, headers = { 'Content-Type': 'application/json' }) =>
  handleAdminRequest(new Request(`https://x.dev${path}`, {
    method,
    headers: { 'Cf-Access-Jwt-Assertion': token, ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
  }), env, deps);

describe('draft routes', () => {
  it('are closed without an Access token', async () => {
    const res = await handleAdminRequest(new Request('https://x.dev/api/admin/draft'), makeEnv(), deps);
    expect(res.status).toBe(401);
  });

  it('answer 500 STORAGE_UNAVAILABLE without the private bucket', async () => {
    const env = { ...makeEnv(), PRIVATE_BUCKET: undefined };
    const res = await call(env, 'GET', '/api/admin/draft');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_UNAVAILABLE' });
  });

  it('GET /draft: the published site when there is no draft, then the draft', async () => {
    const env = makeEnv({ '_site/site.json': SITE, '_data/albums.json': { albums: [ALBUM] } });
    expect(await (await call(env, 'GET', '/api/admin/draft')).json())
      .toEqual({ site: SITE, albums: [ALBUM], hasDraft: false });

    const edited = { ...SITE, bio: 'Bozza' };
    expect((await call(env, 'PUT', '/api/admin/draft/site', edited)).status).toBe(200);
    expect(await (await call(env, 'GET', '/api/admin/draft')).json())
      .toEqual({ site: edited, albums: [ALBUM], hasDraft: true });
    // Saving the draft never touches the published site.
    expect(JSON.parse(env.BUCKET.store.get('_site/site.json').text)).toEqual(SITE);
  });

  it('GET /draft on a new installation: no site, no albums', async () => {
    expect(await (await call(makeEnv(), 'GET', '/api/admin/draft')).json())
      .toEqual({ site: null, albums: [], hasDraft: false });
  });

  it('validates what it saves', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/draft/site', { name: '' })).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/draft/albums', { albums: 'no' })).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/draft/albums/notte/manifest', [{ name: 'x.jpg' }])).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/draft/site', '{not json')).status).toBe(400);
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
  });

  it('manifest: draft first, then published, then empty', async () => {
    const env = makeEnv({ 'notte/manifest.json': [{ name: 'a.webp', width: 1, height: 1 }] });
    expect(await (await call(env, 'GET', '/api/admin/draft/albums/notte/manifest')).json()).toHaveLength(1);
    expect(await (await call(env, 'GET', '/api/admin/draft/albums/nuovo/manifest')).json()).toEqual([]);
    await call(env, 'PUT', '/api/admin/draft/albums/notte/manifest', []);
    expect(await (await call(env, 'GET', '/api/admin/draft/albums/notte/manifest')).json()).toEqual([]);
    expect((await call(env, 'GET', '/api/admin/draft/albums/BAD/manifest')).status).toBe(404);
  });

  it('staging: upload, read back, delete; only WebP up to 10 MB', async () => {
    const env = makeEnv();
    const webp = { 'Content-Type': 'image/webp' };
    expect((await call(env, 'PUT', '/api/admin/staging/notte/c.webp', new Uint8Array([1, 2]), webp)).status).toBe(200);
    expect(env.PRIVATE_BUCKET.store.has('staging/notte/c.webp')).toBe(true);
    expect(env.BUCKET.store.size).toBe(0);

    const read = await call(env, 'GET', '/api/admin/staging/notte/c.webp');
    expect(read.status).toBe(200);
    expect(read.headers.get('Content-Type')).toBe('image/webp');

    expect((await call(env, 'PUT', '/api/admin/staging/notte/c.webp', 'x', { 'Content-Type': 'image/png' })).status).toBe(415);
    expect((await call(env, 'PUT', '/api/admin/staging/notte/..%2Fx.webp', new Uint8Array([1]), webp)).status).toBe(400);
    expect((await call(env, 'DELETE', '/api/admin/staging/notte/c.webp')).status).toBe(200);
    expect((await call(env, 'GET', '/api/admin/staging/notte/c.webp')).status).toBe(404);
  });

  it('status lists the changes; DELETE /draft discards draft and waiting photos', async () => {
    const env = makeEnv({ '_site/site.json': SITE, '_data/albums.json': { albums: [ALBUM] } }, {
      'draft/site.json': { ...SITE, bio: 'Bozza' },
      'staging/notte/c.webp': 'C',
    });
    expect(await (await call(env, 'GET', '/api/admin/draft/status')).json())
      .toEqual({ hasDraft: true, publishing: false, changes: [{ type: 'site' }] });

    expect((await call(env, 'DELETE', '/api/admin/draft')).status).toBe(200);
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
    expect(await (await call(env, 'GET', '/api/admin/draft/status')).json()).toEqual({ hasDraft: false, publishing: false, changes: [] });
  });

  it('DELETE /draft also removes photos an interrupted publication copied but never published', async () => {
    const env = makeEnv({
      'notte/manifest.json': [{ name: 'a.webp', width: 1, height: 1 }],
      'notte/a.webp': 'A', 'notte/c.webp': 'C',
    }, { 'draft/copied.json': ['notte/c.webp', 'notte/a.webp'], 'draft/site.json': SITE });
    expect((await call(env, 'DELETE', '/api/admin/draft')).status).toBe(200);
    expect(env.BUCKET.store.has('notte/c.webp')).toBe(false);
    expect(env.BUCKET.store.has('notte/a.webp')).toBe(true);
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
  });

  it('status says when a publication started and did not finish', async () => {
    const env = makeEnv({}, { 'draft/site.json': SITE, 'draft/copied.json': ['notte/c.webp'] });
    expect((await (await call(env, 'GET', '/api/admin/draft/status')).json()).publishing).toBe(true);
  });

  it('DELETE /draft is refused once a publication has started overwriting the site', async () => {
    const env = makeEnv({}, { 'draft/site.json': SITE, 'draft/cleanup.json': { prefixes: [], keys: [] } });
    const res = await call(env, 'DELETE', '/api/admin/draft');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'PUBLISH_IN_PROGRESS' });
    expect(env.PRIVATE_BUCKET.store.has('draft/site.json')).toBe(true);
  });

  it('staging: a malformed escape in the name is a 400, not a crash', async () => {
    expect((await call(makeEnv(), 'GET', '/api/admin/staging/notte/%E0%A4%A.webp')).status).toBe(400);
  });

  it('preview photos: the waiting one first, then the published one, else 404', async () => {
    const env = makeEnv({ 'notte/a.webp': 'PUBLIC-A', 'notte/b.webp': 'PUBLIC-B' }, { 'staging/notte/a.webp': 'STAGED-A' });
    const a = await call(env, 'GET', '/api/admin/preview/photo/notte/a.webp');
    expect(await a.text()).toBe('STAGED-A');
    expect(a.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(a.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await (await call(env, 'GET', '/api/admin/preview/photo/notte/b.webp')).text()).toBe('PUBLIC-B');
    expect((await call(env, 'GET', '/api/admin/preview/photo/notte/zzz.webp')).status).toBe(404);
    expect((await call(env, 'GET', '/api/admin/preview/photo/notte/..%2Fx.webp')).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/preview/photo/notte/a.webp', 'x')).status).toBe(405);
  });

  it('preview photos: an unchanged photo is not sent again (ETag)', async () => {
    const env = makeEnv({ 'notte/a.webp': 'PUBLIC-A' });
    const realGet = env.BUCKET.get.bind(env.BUCKET);
    env.BUCKET.get = async key => ({ ...(await realGet(key)), httpEtag: '"v1"' });
    const first = await call(env, 'GET', '/api/admin/preview/photo/notte/a.webp');
    expect(first.headers.get('ETag')).toBe('"v1"');
    const again = await call(env, 'GET', '/api/admin/preview/photo/notte/a.webp', undefined, { 'If-None-Match': '"v1"' });
    expect(again.status).toBe(304);
  });

  it('preview photos are closed without an Access token', async () => {
    const res = await handleAdminRequest(new Request('https://x.dev/api/admin/preview/photo/notte/a.webp'), makeEnv(), deps);
    expect(res.status).toBe(401);
  });

  it('publish: POST only; 409 with the problems when the draft cannot be published', async () => {
    const env = makeEnv({ '_data/albums.json': { albums: [ALBUM] } }, {
      'draft/albums/notte/manifest.json': [{ name: 'ghost.webp', width: 1, height: 1 }],
    });
    expect((await call(env, 'GET', '/api/admin/publish')).status).toBe(405);
    const res = await call(env, 'POST', '/api/admin/publish');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'PUBLISH_CHECK_FAILED', problems: [{ slug: 'notte', name: 'ghost.webp', reason: 'PHOTO_MISSING' }],
    });
  });

  it('publish: a step that completes', async () => {
    const env = makeEnv({}, { 'draft/site.json': SITE });
    expect(await (await call(env, 'POST', '/api/admin/publish')).json()).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(JSON.parse(env.BUCKET.store.get('_site/site.json').text)).toEqual(SITE);
  });
});
