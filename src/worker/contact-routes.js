/**
 * Contact form submission handler.
 * This is the only unauthenticated write in the system. Every validation here
 * exists because anyone can call this endpoint.
 */
import { jsonResponse } from './http.js';
import { validateContactShape } from '../shared/contact-rules.js';
import { buildMessage, messageKey } from '../utils/buildMessage.js';
import { notifyBody } from '../utils/notifyBody.js';
import { verifyTurnstile } from './turnstile.js';

const MAX_BODY = 16 * 1024;
const NOTIFY_TIMEOUT_MS = 3000;

class NotificationHttpError extends Error {
  constructor(status) {
    super('notification endpoint rejected the request');
    this.status = status;
  }
}

function randSuffix() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
}

async function inviaNotifica(env, messaggio, adminUrl) {
  const url = env.CONTACT_NOTIFY_URL;
  if (!url) return;
  const response = await fetch(url, {
    method: 'POST',
    body: notifyBody(messaggio, adminUrl),
    signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
  });
  if (!response.ok) throw new NotificationHttpError(response.status);
}

/**
 * Handles a contact form submission: validates, stores, and notifies.
 * @param {Request} request - The incoming HTTP request with contact form data in JSON.
 * @param {object} env - Cloudflare Worker environment with BUCKET and CONTACT_NOTIFY_URL.
 * @param {{now?: () => number, rand?: () => string, notify?: Function, verify?: Function}} deps - Injected dependencies for testing.
 * @returns {Promise<Response>} JSON response with ok: true on success or error details.
 */
export async function handleContactRequest(request, env, deps = {}) {
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  // A sitekey without its secret would draw the widget and verify nothing. Refuse instead,
  // so a forgotten `wrangler versions secret put TURNSTILE_SECRET` shows up at once.
  if (env.TURNSTILE_SITEKEY && !env.TURNSTILE_SECRET) {
    console.error('contact: TURNSTILE_SITEKEY is set but TURNSTILE_SECRET is missing; refusing submissions.');
    return jsonResponse({ error: 'TURNSTILE_NOT_CONFIGURED' }, 503);
  }

  const now = deps.now ?? Date.now;
  const rand = deps.rand ?? randSuffix;
  const notify = deps.notify ?? inviaNotifica;
  const verify = deps.verify ?? ((token) => verifyTurnstile(token, env.TURNSTILE_SECRET ?? ''));

  // Check Content-Length before reading: oversized bodies are rejected without
  // loading into memory. The header can be omitted or lie, so actual length
  // is double-checked as a second defense.
  const dichiarata = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(dichiarata) && dichiarata > MAX_BODY) {
    return jsonResponse({ error: 'TOO_LARGE' }, 400);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return jsonResponse({ error: 'TOO_LARGE' }, 400);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  // Honeypot: intentionally returns 200 success. A bot receiving an error retries
  // with variations; one receiving success stops and moves on.
  if (data?.botcheck) return jsonResponse({ ok: true });

  if (!(await verify(data?.['cf-turnstile-response'] ?? ''))) {
    return jsonResponse({ error: 'CHALLENGE_FAILED' }, 403);
  }

  const esito = validateContactShape(data);
  if (!esito.ok) return jsonResponse({ error: 'INVALID', detail: esito.error }, 400);

  // Call now() exactly once: calling it twice produces different timestamps
  // for the key and the message content. Tests with frozen time would never catch this.
  const ts = now();
  const messaggio = buildMessage(data, ts);
  await env.BUCKET.put(messageKey(ts, rand()), JSON.stringify(messaggio), {
    httpMetadata: { contentType: 'application/json' },
  });

  // Message is already safely stored. If notification fails, the visitor
  // must not know or suffer any consequences.
  try {
    const adminUrl = new URL('/admin', request.url).href;
    await notify(env, messaggio, adminUrl);
  } catch (err) {
    console.error('notification failed:',
      err instanceof NotificationHttpError ? `HTTP ${err.status}` : 'request error');
  }

  return jsonResponse({ ok: true });
}
