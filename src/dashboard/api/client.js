/**
 * Calls to the Worker's admin routes (behind Cloudflare Access). Every error becomes an
 * ApiError carrying the status and the Worker's JSON body, so screens can explain it.
 */

export class ApiError extends Error {
  /**
   * @param {number} status - HTTP status, 0 when the network failed.
   * @param {object} body - The Worker's JSON answer, e.g. { error: 'PUBLISH_IN_PROGRESS' }.
   */
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body ?? {};
  }
}

/**
 * Sends a photo (a WebP blob) with PUT, e.g. to /api/admin/staging/<slug>/<name>.
 * @param {string} path
 * @param {Blob} blob
 * @param {{fetchImpl?: Function}} [options]
 */
export async function upload(path, blob, { fetchImpl = globalThis.fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(path, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: blob });
  } catch {
    throw new ApiError(0, { error: 'NETWORK' });
  }
  if (res.ok) return;
  let body = {};
  try { body = await res.json(); } catch { /* not JSON */ }
  throw new ApiError(res.status, body);
}

/**
 * @param {string} path - Absolute path, e.g. '/api/admin/draft'.
 * @param {{method?: string, json?: any, fetchImpl?: Function}} [options]
 * @returns {Promise<any>} The parsed JSON answer.
 */
export async function request(path, { method = 'GET', json, fetchImpl = globalThis.fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(path, {
      method,
      headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, { error: 'NETWORK' });
  }
  let body = {};
  try { body = await res.json(); } catch { /* an empty or non-JSON answer */ }
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}
