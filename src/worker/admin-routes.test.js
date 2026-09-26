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
  ...ENV_VARS, ASSETS: makeFakeAssets(), BUCKET: makeFakeBucket(initial), MESSAGES_BUCKET: makeFakeBucket(messages),
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

describe('PUT /api/admin/site', () => {
  it('salva site.json valido', async () => {
    const env = makeEnv();
    const res = await call(env, 'PUT', '/api/admin/site', SITE);
    expect(res.status).toBe(200);
    expect(JSON.parse(env.BUCKET.store.get('_site/site.json').text)).toEqual(SITE);
  });
  it('400 su shape invalida e su JSON malformato', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/site', { name: '' })).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/site', '{non-json')).status).toBe(400);
    expect(env.BUCKET.store.has('_site/site.json')).toBe(false);
  });
  it('errore di scrittura R2 → 500 con JSON pulito, non un unhandled rejection', async () => {
    const env = makeEnv();
    env.BUCKET.put = async () => { throw new Error('R2 down'); };
    const res = await call(env, 'PUT', '/api/admin/site', SITE);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_ERROR' });
  });
});

describe('PUT /api/admin/albums', () => {
  it('salva albums.json valido, anche con uno slug riservato scritto a mano', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/albums', ALBUMS)).status).toBe(200);
    expect(JSON.parse(env.BUCKET.store.get('_data/albums.json').text)).toEqual(ALBUMS);
    const reserved = { albums: [{ slug: 'admin', title: 'X', description: '', coverName: null }] };
    expect((await call(env, 'PUT', '/api/admin/albums', reserved)).status).toBe(200);
  });
});

describe('PUT /api/admin/albums/:slug/manifest', () => {
  it('salva manifest valido; 400 su entry invalida; 404 su slug malformato', async () => {
    const env = makeEnv();
    const manifest = [{ name: 'a.webp', width: 10, height: 20 }];
    expect((await call(env, 'PUT', '/api/admin/albums/sport/manifest', manifest)).status).toBe(200);
    expect(JSON.parse(env.BUCKET.store.get('sport/manifest.json').text)).toEqual(manifest);
    expect((await call(env, 'PUT', '/api/admin/albums/sport/manifest', [{ name: 'a.jpg', width: 1, height: 1 }])).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/albums/NO SLUG/manifest', manifest)).status).toBe(404);
  });
  it('salva il manifest anche per un album con slug riservato', async () => {
    const env = makeEnv();
    const manifest = [{ name: 'a.webp', width: 10, height: 20 }];
    expect((await call(env, 'PUT', '/api/admin/albums/admin/manifest', manifest)).status).toBe(200);
  });
});

describe('rotte sconosciute', () => {
  it('404 su path ignoto; 405 su metodo sbagliato', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/boh', {})).status).toBe(404);
    expect((await call(env, 'GET', '/api/admin/site')).status).toBe(405);
  });
});

describe('PUT /api/admin/albums/:slug/photos/:name', () => {
  const put = (env, path, body, ct = 'image/webp') =>
    handleAdminRequest(new Request(`https://x.dev${path}`, {
      method: 'PUT', body, headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': ct },
    }), env, deps);

  it('salva il body come oggetto webp', async () => {
    const env = makeEnv();
    const res = await put(env, '/api/admin/albums/sport/photos/nuova.webp', new Uint8Array([1, 2, 3]));
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.has('sport/nuova.webp')).toBe(true);
    expect(env.BUCKET.store.get('sport/nuova.webp').contentType).toBe('image/webp');
  });

  it('accetta nomi legacy con maiuscole', async () => {
    const env = makeEnv();
    expect((await put(env, '/api/admin/albums/sport/photos/4x5-IMG_8689-.webp', new Uint8Array([1]))).status).toBe(200);
  });

  it('rifiuta content-type sbagliato (415), nome invalido (400), body oltre 10MB (413)', async () => {
    const env = makeEnv();
    expect((await put(env, '/api/admin/albums/sport/photos/a.webp', new Uint8Array([1]), 'image/jpeg')).status).toBe(415);
    expect((await put(env, '/api/admin/albums/sport/photos/a.jpg', new Uint8Array([1]))).status).toBe(400);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    expect((await put(env, '/api/admin/albums/sport/photos/a.webp', big)).status).toBe(413);
  });

  it('PUT: errore R2 → 500 con JSON pulito', async () => {
    const env = makeEnv();
    env.BUCKET.put = async () => { throw new Error('R2 down'); };
    const res = await put(env, '/api/admin/albums/sport/photos/a.webp', new Uint8Array([1]));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_ERROR' });
  });

  it('carica una foto anche in un album con slug riservato', async () => {
    const env = makeEnv();
    expect((await put(env, '/api/admin/albums/admin/photos/a.webp', new Uint8Array([1]))).status).toBe(200);
  });
});

describe('DELETE /api/admin/albums/:slug/photos/:name', () => {
  it('elimina oggetto e entry dal manifest; idempotente se manifest assente', async () => {
    const env = makeEnv({
      'sport/a.webp': 'BIN', 'sport/b.webp': 'BIN',
      'sport/manifest.json': [{ name: 'a.webp', width: 1, height: 1 }, { name: 'b.webp', width: 1, height: 1 }],
    });
    const res = await call(env, 'DELETE', '/api/admin/albums/sport/photos/a.webp');
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.has('sport/a.webp')).toBe(false);
    expect(JSON.parse(env.BUCKET.store.get('sport/manifest.json').text)).toEqual([{ name: 'b.webp', width: 1, height: 1 }]);
    // senza manifest: nessun errore
    const env2 = makeEnv({ 'sport/c.webp': 'BIN' });
    expect((await call(env2, 'DELETE', '/api/admin/albums/sport/photos/c.webp')).status).toBe(200);
  });

  it('DELETE: errore R2 → 500 con JSON pulito', async () => {
    const env = makeEnv({ 'sport/a.webp': 'BIN' });
    env.BUCKET.delete = async () => { throw new Error('R2 down'); };
    const res = await call(env, 'DELETE', '/api/admin/albums/sport/photos/a.webp');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_ERROR' });
  });
});

describe('DELETE /api/admin/albums/:slug', () => {
  it('cancella >1000 oggetti con paginazione e rimuove la voce da albums.json', async () => {
    const initial = { '_data/albums.json': ALBUMS };
    for (let i = 0; i < 1203; i++) initial[`sport/foto-${String(i).padStart(4, '0')}.webp`] = 'BIN';
    initial['sport/manifest.json'] = [];
    initial['around/x.webp'] = 'BIN'; // altro album: non deve essere toccato
    const env = makeEnv(initial);
    const res = await call(env, 'DELETE', '/api/admin/albums/sport');
    expect(res.status).toBe(200);
    expect([...env.BUCKET.store.keys()].filter(k => k.startsWith('sport/'))).toEqual([]);
    expect(env.BUCKET.store.has('around/x.webp')).toBe(true);
    expect(JSON.parse(env.BUCKET.store.get('_data/albums.json').text)).toEqual({ albums: [] });
  });

  it('idempotente: cancellare un album inesistente risponde 200', async () => {
    expect((await call(makeEnv(), 'DELETE', '/api/admin/albums/fantasma')).status).toBe(200);
  });

  it('elimina anche un album con slug riservato', async () => {
    const env = makeEnv({ 'admin/a.webp': 'BIN' });
    expect((await call(env, 'DELETE', '/api/admin/albums/admin')).status).toBe(200);
    expect(env.BUCKET.store.has('admin/a.webp')).toBe(false);
  });

  it('DELETE album: errore R2 durante list → 500 con JSON pulito', async () => {
    const env = makeEnv({ 'sport/a.webp': 'BIN' });
    env.BUCKET.list = async () => { throw new Error('R2 down'); };
    const res = await call(env, 'DELETE', '/api/admin/albums/sport');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_ERROR' });
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
    expect(env.MESSAGES_BUCKET.store.size).toBe(0);
  });

  it('un id con una barra non puo uscire da _messages/', async () => {
    const env = makeEnv({}, { 'altro/x.json': SITE });
    const res = await call(env, 'DELETE', '/api/admin/messages/..%2Faltro%2Fx.json');
    expect(res.status).toBe(400);
    expect(env.MESSAGES_BUCKET.store.has('altro/x.json')).toBe(true);
  });

  it('senza bucket privato risponde 500, senza leggere quello pubblico', async () => {
    const env = { ...makeEnv({ '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 }), MESSAGES_BUCKET: undefined };
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
