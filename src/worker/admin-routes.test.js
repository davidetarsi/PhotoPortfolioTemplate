// src/worker/admin-routes.test.js
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker.js';
import { handleAdminRequest } from './admin-routes.js';
import { _resetJwksCache } from './access-jwt.js';
import { makeFakeBucket, makeFakeAssets, makeJwtTestKit } from './test-helpers.js';

const ENV_VARS = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123' };
const NOW = 1_800_000_000_000;
const SITE = { name: 'Davide', bio: '', hero: null, social: {} };
const ALBUMS = { albums: [{ slug: 'sport', title: 'Sport', description: '', coverName: null }] };

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

const makeEnv = (initial = {}, messages = {}) => ({
  ...ENV_VARS, ASSETS: makeFakeAssets(), BUCKET: makeFakeBucket(initial), PRIVATE_BUCKET: makeFakeBucket(messages),
});
const call = (env, method, path, body, headers = {}) =>
  handleAdminRequest(new Request(`https://x.dev${path}`, {
    method,
    headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }), env, deps);

describe('auth gate', () => {
  it('401 senza token; 401 con token invalido', async () => {
    const env = makeEnv();
    const noTok = await handleAdminRequest(new Request('https://x.dev/api/admin/site', { method: 'PUT', body: '{}' }), env, deps);
    expect(noTok.status).toBe(401);
    const bad = await handleAdminRequest(new Request('https://x.dev/api/admin/site', {
      method: 'PUT', body: '{}', headers: { 'Cf-Access-Jwt-Assertion': 'x.y.z' },
    }), env, deps);
    expect(bad.status).toBe(401);
  });

  it('il worker instrada /api/admin/* verso il gate (401 senza token)', async () => {
    const res = await worker.fetch(new Request('https://x.dev/api/admin/site', { method: 'PUT', body: '{}' }), makeEnv());
    expect(res.status).toBe(401);
  });
});

describe('old direct-write routes', () => {
  it('return 404 and leave both buckets untouched', async () => {
    const env = makeEnv({
      '_site/site.json': SITE,
      '_data/albums.json': ALBUMS,
      'sport/manifest.json': [{ name: 'old.webp', width: 10, height: 20 }],
      'sport/old.webp': 'IMAGE',
    }, { '_messages/example.json': { name: 'Mario' } });
    const publicBefore = new Map(env.BUCKET.store);
    const privateBefore = new Map(env.PRIVATE_BUCKET.store);
    const oldWrites = [
      ['PUT', '/api/admin/site', SITE],
      ['PUT', '/api/admin/albums', ALBUMS],
      ['PUT', '/api/admin/albums/sport/manifest', []],
      ['PUT', '/api/admin/albums/sport/photos/new.webp', new Uint8Array([1])],
      ['DELETE', '/api/admin/albums/sport/photos/old.webp'],
      ['DELETE', '/api/admin/albums/sport'],
    ];

    const responses = [];
    for (const [method, path, body] of oldWrites) {
      const headers = body instanceof Uint8Array ? { 'Content-Type': 'image/webp' } : {};
      responses.push(await call(env, method, path, body, headers));
    }

    expect.soft(responses.map(response => response.status)).toEqual(oldWrites.map(() => 404));
    expect(env.BUCKET.store).toEqual(publicBefore);
    expect(env.PRIVATE_BUCKET.store).toEqual(privateBefore);
  });
});

describe('messaggi', () => {
  const M1 = { name: 'Mario', email: 'm@e.it', message: 'Primo', receivedAt: 1000 };
  const M2 = { name: 'Lucia', email: 'l@e.it', message: 'Secondo', receivedAt: 2000 };

  it('elenca i messaggi del bucket privato, dal piu recente', async () => {
    const env = makeEnv({}, {
      '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1,
      '_messages/2026-02-01T00-00-00-000Z-bbb.json': M2,
    });
    const res = await call(env, 'GET', '/api/admin/messages');
    expect(res.status).toBe(200);
    const { messages } = await res.json();
    expect(messages.map(m => m.name)).toEqual(['Lucia', 'Mario']);
    expect(messages[0].id).toBe('2026-02-01T00-00-00-000Z-bbb');
  });

  it('elenca anche oltre i 1000 oggetti di una pagina di R2', async () => {
    const many = {};
    for (let i = 0; i < 1001; i++) {
      many[`_messages/2026-01-01T00-00-00-${String(i).padStart(4, '0')}Z-aaa.json`] = { ...M1, receivedAt: i };
    }
    const { messages } = await (await call(makeEnv({}, many), 'GET', '/api/admin/messages')).json();
    expect(messages).toHaveLength(1001);
    expect(messages[0].receivedAt).toBe(1000);
  });

  it('non legge i vecchi messaggi rimasti nel bucket pubblico', async () => {
    const env = makeEnv({ '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const { messages } = await (await call(env, 'GET', '/api/admin/messages')).json();
    expect(messages).toEqual([]);
  });

  it('elenco vuoto quando non ce ne sono', async () => {
    const res = await call(makeEnv(), 'GET', '/api/admin/messages');
    expect((await res.json()).messages).toEqual([]);
  });

  it('non tira dentro oggetti che non sono messaggi', async () => {
    const env = makeEnv({}, { 'altro/x.json': SITE, '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const { messages } = await (await call(env, 'GET', '/api/admin/messages')).json();
    expect(messages).toHaveLength(1);
  });

  it('cancella un messaggio dal bucket privato', async () => {
    const env = makeEnv({}, { '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const res = await call(env, 'DELETE', '/api/admin/messages/2026-01-01T00-00-00-000Z-aaa');
    expect(res.status).toBe(200);
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
  });

  it('un id con una barra non puo uscire da _messages/', async () => {
    const env = makeEnv({}, { 'altro/x.json': SITE });
    const res = await call(env, 'DELETE', '/api/admin/messages/..%2Faltro%2Fx.json');
    expect(res.status).toBe(400);
    expect(env.PRIVATE_BUCKET.store.has('altro/x.json')).toBe(true);
  });

  it('senza bucket privato risponde 500, senza leggere quello pubblico', async () => {
    const env = { ...makeEnv({ '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 }), PRIVATE_BUCKET: undefined };
    const res = await call(env, 'GET', '/api/admin/messages');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_UNAVAILABLE' });
  });

  it('senza token di Access non si elencano i messaggi', async () => {
    const env = makeEnv({}, { '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const res = await handleAdminRequest(
      new Request('https://x.dev/api/admin/messages', { method: 'GET' }), env, deps);
    expect(res.status).toBe(401);
  });
});
