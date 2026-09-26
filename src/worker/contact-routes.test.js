import { describe, it, expect, vi } from 'vitest';
import { handleContactRequest } from './contact-routes.js';
import { makeFakeBucket } from './test-helpers.js';

const NOW = 1_800_000_000_000;
const VALIDO = { name: 'Mario', email: 'm@e.it', message: 'Ciao' };

const makeDeps = (over = {}) => ({
  now: () => NOW,
  rand: () => 'aaaaaa',
  notify: vi.fn(async () => {}),
  verify: async () => true,
  ...over,
});

const makeEnv = (over = {}) => ({ BUCKET: makeFakeBucket(), ...over });

const post = (env, body, deps = makeDeps()) =>
  handleContactRequest(
    new Request('https://x.dev/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env, deps,
  );

describe('handleContactRequest', () => {
  it('salva il messaggio su R2 e risponde 200', async () => {
    const env = makeEnv();
    const res = await post(env, VALIDO);
    expect(res.status).toBe(200);
    const chiavi = [...env.BUCKET.store.keys()];
    expect(chiavi).toHaveLength(1);
    expect(chiavi[0]).toBe('_messages/2027-01-15T08-00-00-000Z-aaaaaa.json');
    expect(JSON.parse(env.BUCKET.store.get(chiavi[0]).text).name).toBe('Mario');
  });

  it('rifiuta con 503 se c è la sitekey di Turnstile ma manca il secret, senza salvare', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = makeEnv({ TURNSTILE_SITEKEY: '0x4AAAAAAA' });
    const res = await post(env, VALIDO);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'TURNSTILE_NOT_CONFIGURED' });
    expect(env.BUCKET.store.size).toBe(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('con sitekey e secret il form verifica e salva', async () => {
    const env = makeEnv({ TURNSTILE_SITEKEY: '0x4AAAAAAA', TURNSTILE_SECRET: 's' });
    const res = await post(env, VALIDO);
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.size).toBe(1);
  });

  it('rifiuta i metodi diversi da POST', async () => {
    const res = await handleContactRequest(
      new Request('https://x.dev/api/contact', { method: 'GET' }), makeEnv(), makeDeps());
    expect(res.status).toBe(405);
  });

  it('rifiuta un corpo non valido senza toccare R2', async () => {
    const env = makeEnv();
    const res = await post(env, { name: 'Mario' });
    expect(res.status).toBe(400);
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('rifiuta JSON malformato senza esplodere', async () => {
    const env = makeEnv();
    const res = await post(env, '{non json');
    expect(res.status).toBe(400);
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('scarta in silenzio se l honeypot e compilato', async () => {
    // Risponde 200 di proposito: un bot che riceve 400 riprova, uno che
    // riceve 200 crede di aver funzionato e se ne va.
    const env = makeEnv();
    const res = await post(env, { ...VALIDO, botcheck: 'sono un bot' });
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('blocca se Turnstile non passa, senza toccare R2', async () => {
    const env = makeEnv();
    const res = await post(env, VALIDO, makeDeps({ verify: async () => false }));
    expect(res.status).toBe(403);
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('notifica dopo aver salvato', async () => {
    const env = makeEnv();
    const deps = makeDeps();
    await post(env, VALIDO, deps);
    expect(deps.notify).toHaveBeenCalledOnce();
  });

  it('notifica con la dashboard assoluta dell host chiamato', async () => {
    const env = makeEnv();
    const deps = makeDeps();
    await post(env, VALIDO, deps);

    expect(deps.notify).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ name: 'Mario' }),
      'https://x.dev/admin',
    );
  });

  it('se la notifica fallisce il messaggio resta salvato e la risposta e 200', async () => {
    // Un visitatore non deve vedere "invio fallito" perche' il telefono
    // del proprietario era irraggiungibile (spec §4).
    const env = makeEnv();
    const deps = makeDeps({ notify: async () => { throw new Error('webhook giu'); } });
    const res = await post(env, VALIDO, deps);
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.size).toBe(1);
  });

  it('registra un HTTP 429 del provider senza perdere il messaggio o esporre il secret', async () => {
    const env = makeEnv({ CONTACT_NOTIFY_URL: 'https://ntfy.sh/topic-segreto' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429 }));
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await post(env, VALIDO, makeDeps({ notify: undefined }));
      expect(res.status).toBe(200);
      expect(env.BUCKET.store.size).toBe(1);
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(logSpy).toHaveBeenCalledWith('notification failed:', 'HTTP 429');
      expect(JSON.stringify(logSpy.mock.calls)).not.toContain('topic-segreto');
    } finally {
      fetchSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('non registra URL o token se la richiesta di notifica genera un errore di rete', async () => {
    const env = makeEnv({ CONTACT_NOTIFY_URL: 'https://ntfy.sh/topic-segreto' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('request to https://ntfy.sh/topic-segreto failed'),
    );
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await post(env, VALIDO, makeDeps({ notify: undefined }));
      expect(res.status).toBe(200);
      expect(env.BUCKET.store.size).toBe(1);
      expect(logSpy).toHaveBeenCalledWith('notification failed:', 'request error');
      expect(JSON.stringify(logSpy.mock.calls)).not.toContain('topic-segreto');
    } finally {
      fetchSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('rifiuta un corpo enorme, senza toccare R2', async () => {
    const env = makeEnv();
    const res = await post(env, { ...VALIDO, message: 'x'.repeat(100_000) });
    expect(res.status).toBe(400);
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('respinge sul Content-Length, prima ancora di leggere il corpo', async () => {
    // Un corpo enorme non deve finire in memoria per poi essere scartato.
    // L'intestazione puo' mentire, ma quando dice la verita' risparmia il
    // lavoro; il controllo sulla lunghezza reale resta come seconda rete.
    const env = makeEnv();
    let letto = false;
    const req = new Request('https://x.dev/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '999999' },
      body: JSON.stringify(VALIDO),
    });
    const spiato = new Proxy(req, {
      get(target, prop) {
        if (prop === 'text') return async () => { letto = true; return await target.text(); };
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const res = await handleContactRequest(spiato, env, makeDeps());
    expect(res.status).toBe(400);
    expect(letto).toBe(false);
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('receivedAt e la chiave dichiarano lo stesso istante', async () => {
    // now() va chiamato una volta sola: due chiamate a Date.now possono
    // restituire millisecondi diversi, e la chiave direbbe un'ora e il
    // contenuto un'altra. Col tempo congelato nei test non si vedrebbe.
    const env = makeEnv();
    let t = 1_000_000;
    await post(env, VALIDO, makeDeps({ now: () => t++ }));
    const [chiave] = [...env.BUCKET.store.keys()];
    const salvato = JSON.parse(env.BUCKET.store.get(chiave).text);
    const nellaChiave = new Date(
      chiave.slice('_messages/'.length, -'-aaaaaa.json'.length).replace(
        /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1T$2:$3:$4.$5Z'),
    ).getTime();
    expect(nellaChiave).toBe(salvato.receivedAt);
  });

  it('non salva i campi estranei arrivati dal client', async () => {
    const env = makeEnv();
    await post(env, { ...VALIDO, receivedAt: 1, ip: '1.2.3.4' });
    const salvato = JSON.parse([...env.BUCKET.store.values()][0].text);
    expect(salvato.receivedAt).toBe(NOW);
    expect('ip' in salvato).toBe(false);
  });
});
