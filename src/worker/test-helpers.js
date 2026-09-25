// Fake Cloudflare bindings for tests (node environment).

/**
 * Creates a fake R2 bucket implementation for testing.
 * Mimics R2 get, put, delete, and paginated list operations.
 * @param {Object} [initial] - Initial key-value pairs.
 * @returns {Object} Fake bucket with store, get, put, delete, list methods.
 */
export function makeFakeBucket(initial = {}) {
  const store = new Map(); // key → { text, contentType }
  for (const [k, v] of Object.entries(initial)) {
    store.set(k, { text: typeof v === 'string' ? v : JSON.stringify(v), contentType: 'application/json' });
  }
  const toText = async value => {
    if (typeof value === 'string') return value;
    if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
    if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value);
    // ReadableStream (request.body) → consume by wrapping in Response.
    return await new Response(value).text();
  };
  return {
    store,
    async get(key) {
      const rec = store.get(key);
      if (!rec) return null;
      return { text: async () => rec.text, json: async () => JSON.parse(rec.text) };
    },
    async put(key, value, opts = {}) {
      store.set(key, { text: await toText(value), contentType: opts.httpMetadata?.contentType });
    },
    async delete(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      // Cursor = last key from previous page (like real R2/S3), not numeric offset:
      // must stay valid even if caller deletes already-seen keys between list() calls
      // (exactly the list→delete→list pattern in admin-routes.js for paginated album deletion).
      const all = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
      const startIdx = cursor ? all.findIndex(k => k > cursor) : 0;
      const from = startIdx === -1 ? all.length : startIdx;
      const page = all.slice(from, from + limit);
      const truncated = from + page.length < all.length;
      return { objects: page.map(key => ({ key })), truncated, ...(truncated ? { cursor: page[page.length - 1] } : {}) };
    },
  };
}

/**
 * Creates a fake Assets binding for testing.
 * Records fetch calls for verification. `pages` maps a pathname to the HTML body
 * to return; any other path answers `ASSET:<path>`.
 * @param {Record<string, string>} [pages] - Bodies to return, by pathname.
 * @returns {Object} Fake assets with calls array and fetch method.
 */
export function makeFakeAssets(pages = {}) {
  const calls = [];
  return {
    calls,
    async fetch(urlOrRequest) {
      // urlOrRequest can be string | URL | Request: the real binding (Fetcher.fetch)
      // accepts all three. URL has no .url property (only .href).
      const href = typeof urlOrRequest === 'string' ? urlOrRequest : (urlOrRequest.url ?? urlOrRequest.href);
      const u = new URL(href);
      calls.push(u.pathname);
      const body = pages[u.pathname] ?? `ASSET:${u.pathname}`;
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
    },
  };
}

const te = new TextEncoder();
const bytesToB64url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Generates a real RSA keypair and creates valid signed JWTs for testing.
 * @param {Object} [config] - Configuration object.
 * @param {string} [config.kid] - Key ID for JWT header (default: 'test-key-1').
 * @returns {Promise<{jwk: Object, signToken: Function, fetchJwks: Function}>} Test kit with key and sign method.
 */
export async function makeJwtTestKit({ kid = 'test-key-1' } = {}) {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid, alg: 'RS256', use: 'sig' };
  async function signToken(payload, { kidOverride = kid } = {}) {
    const h = bytesToB64url(te.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: kidOverride })));
    const p = bytesToB64url(te.encode(JSON.stringify(payload)));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, te.encode(`${h}.${p}`));
    return `${h}.${p}.${bytesToB64url(sig)}`;
  }
  return { jwk, signToken, fetchJwks: async () => ({ keys: [jwk] }) };
}
