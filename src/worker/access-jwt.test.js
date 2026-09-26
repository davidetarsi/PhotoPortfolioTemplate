// src/worker/access-jwt.test.js
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAccessJwt, _resetJwksCache } from './access-jwt.js';
import { makeJwtTestKit } from './test-helpers.js';

const ENV = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123' };
const NOW = 1_800_000_000_000; // ms
const basePayload = () => ({
  aud: ['aud-123'],
  iss: 'https://team.cloudflareaccess.com',
  exp: Math.floor(NOW / 1000) + 3600,
  iat: Math.floor(NOW / 1000),
  email: 'io@example.com',
});
const reqWith = token =>
  new Request('https://x.dev/api/admin/site', { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });

describe('verifyAccessJwt', () => {
  let kit;
  beforeEach(async () => {
    _resetJwksCache();
    kit = await makeJwtTestKit();
  });
  const deps = () => ({ fetchJwks: kit.fetchJwks, now: () => NOW });

  it('accetta un token valido', async () => {
    const token = await kit.signToken(basePayload());
    const res = await verifyAccessJwt(reqWith(token), ENV, deps());
    expect(res.ok).toBe(true);
    expect(res.payload.email).toBe('io@example.com');
  });

  it('rifiuta: token assente, scaduto, aud sbagliata, iss sbagliato', async () => {
    expect((await verifyAccessJwt(reqWith(null), ENV, deps())).ok).toBe(false);
    const scaduto = await kit.signToken({ ...basePayload(), exp: Math.floor(NOW / 1000) - 10 });
    expect((await verifyAccessJwt(reqWith(scaduto), ENV, deps())).ok).toBe(false);
    const badAud = await kit.signToken({ ...basePayload(), aud: ['altro'] });
    expect((await verifyAccessJwt(reqWith(badAud), ENV, deps())).ok).toBe(false);
    const badIss = await kit.signToken({ ...basePayload(), iss: 'https://evil.example' });
    expect((await verifyAccessJwt(reqWith(badIss), ENV, deps())).ok).toBe(false);
  });

  it('rifiuta firma non valida (token firmato da chiave diversa)', async () => {
    const altro = await makeJwtTestKit({ kid: 'test-key-1' }); // stesso kid, chiave diversa
    const token = await altro.signToken(basePayload());
    expect((await verifyAccessJwt(reqWith(token), ENV, deps())).ok).toBe(false);
  });

  it('fail-closed se env non configurato', async () => {
    const token = await kit.signToken(basePayload());
    expect((await verifyAccessJwt(reqWith(token), {}, deps())).ok).toBe(false);
  });

  it('usa la cache JWKS (una sola fetch per due verifiche)', async () => {
    let calls = 0;
    const counting = async () => { calls++; return kit.fetchJwks(); };
    const d = { fetchJwks: counting, now: () => NOW };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d);
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d);
    expect(calls).toBe(1);
  });

  it('kid sconosciuto → refresh JWKS, se l ultimo download ha almeno un minuto; TTL scaduto → refresh', async () => {
    let calls = 0;
    const rotating = await makeJwtTestKit({ kid: 'nuova-chiave' });
    const LATER = NOW + 60_000;
    let now = NOW;
    const d = {
      now: () => now,
      fetchJwks: async () => { calls++; return calls === 1 ? kit.fetchJwks() : rotating.fetchJwks(); },
    };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d); // popola cache (kit)
    now = LATER;
    const res = await verifyAccessJwt(reqWith(await rotating.signToken(basePayload())), ENV, d);
    expect(res.ok).toBe(true);
    expect(calls).toBe(2); // refresh su kid sconosciuto, un minuto dopo

    _resetJwksCache();
    let calls2 = 0;
    const d2 = { fetchJwks: async () => { calls2++; return kit.fetchJwks(); }, now: () => NOW };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d2);
    const d3 = { ...d2, now: () => NOW + 3_600_001 }; // oltre TTL 1h
    const late = { ...basePayload(), exp: Math.floor((NOW + 3_600_001) / 1000) + 3600, iat: Math.floor((NOW + 3_600_001) / 1000) };
    await verifyAccessJwt(reqWith(await kit.signToken(late)), ENV, d3);
    expect(calls2).toBe(2); // refresh su TTL
  });

  it('kid sconosciuti ripetuti: al massimo un download al minuto', async () => {
    let calls = 0;
    const d = { fetchJwks: async () => { calls++; return kit.fetchJwks(); }, now: () => NOW };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d); // popola cache
    for (let i = 0; i < 5; i++) {
      const stranger = await makeJwtTestKit({ kid: `ignota-${i}` });
      expect((await verifyAccessJwt(reqWith(await stranger.signToken(basePayload())), ENV, d)).ok).toBe(false);
    }
    expect(calls).toBe(1);
  });

  it('un token senza kid non scarica le chiavi', async () => {
    let calls = 0;
    const d = { fetchJwks: async () => { calls++; return kit.fetchJwks(); }, now: () => NOW };
    const [, payload, signature] = (await kit.signToken(basePayload())).split('.');
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect((await verifyAccessJwt(reqWith(`${header}.${payload}.${signature}`), ENV, d)).ok).toBe(false);
    expect(calls).toBe(0);
  });
});
