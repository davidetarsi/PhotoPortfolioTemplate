/**
 * Cloudflare Access JWT verification.
 * Defense in depth: even if the Access policy were bypassed, admin routes stay closed.
 * Verifies RS256 signatures from Cloudflare Access JWT tokens.
 */

const JWKS_TTL_MS = 3_600_000; // 1h

// An unknown kid may mean a key rotation, so it triggers a download — but at most one a
// minute: otherwise anyone could force a fetch to the team domain with every forged token.
const UNKNOWN_KID_REFETCH_MS = 60_000;

// Module-level cache: survives across requests within the same isolate.
let jwksCache = null; // { teamDomain, fetchedAt, keys: Map<kid, CryptoKey> }

export function _resetJwksCache() { jwksCache = null; }

const b64urlToBytes = s => {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
  const bin = atob(norm + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const decodeSegment = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function defaultFetchJwks(teamDomain) {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return res.json();
}

async function importJwks(jwks) {
  const keys = new Map();
  for (const jwk of jwks.keys ?? []) {
    if (jwk.kty !== 'RSA') continue;
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    keys.set(jwk.kid, key);
  }
  return keys;
}

async function getKey(kid, teamDomain, fetchJwks, now) {
  const stale = !jwksCache || jwksCache.teamDomain !== teamDomain || now - jwksCache.fetchedAt > JWKS_TTL_MS;
  const unknownKid = !stale && !jwksCache.keys.has(kid);
  if (stale || (unknownKid && now - jwksCache.fetchedAt >= UNKNOWN_KID_REFETCH_MS)) {
    const keys = await importJwks(await fetchJwks(teamDomain));
    jwksCache = { teamDomain, fetchedAt: now, keys };
  }
  return jwksCache.keys.get(kid) ?? null;
}

/**
 * Verifies a Cloudflare Access JWT from the request header.
 * @param {Request} request - The incoming HTTP request.
 * @param {object} env - Cloudflare Worker environment (ACCESS_TEAM_DOMAIN, ACCESS_AUD).
 * @param {{fetchJwks?: Function, now?: Function}} deps - Injected dependencies for testing.
 * @returns {Promise<{ok: true, payload?: object} | {ok: false}>} Verification result.
 */
export async function verifyAccessJwt(request, env, deps = {}) {
  const fetchJwks = deps.fetchJwks ?? defaultFetchJwks;
  const now = (deps.now ?? Date.now)();
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud) return { ok: false }; // fail-closed

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false };

  try {
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false };

    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
    if (!audOk) return { ok: false };
    if (payload.iss !== `https://${teamDomain}`) return { ok: false };
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return { ok: false };
    if (typeof payload.nbf === 'number' && payload.nbf * 1000 > now) return { ok: false };

    const key = await getKey(header.kid, teamDomain, fetchJwks, now);
    if (!key) return { ok: false };
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? { ok: true, payload } : { ok: false };
  } catch {
    return { ok: false };
  }
}
