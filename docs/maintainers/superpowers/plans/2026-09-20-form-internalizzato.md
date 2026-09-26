# Form internalizzato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Togliere Web3Forms e far arrivare i messaggi del form dentro il sistema: scritti dal Worker su R2, letti dalla dashboard, con una notifica dove preferisci.

**Architecture:** Una rotta pubblica `POST /api/contact` sul Worker valida e scrive il messaggio su R2 sotto `_messages/`; se configurato, fa un POST a un webhook che non contiene il testo del messaggio. La dashboard guadagna una sezione Messaggi dietro Cloudflare Access. Turnstile protegge la rotta ed è dichiarato in Terraform. Ogni decisione di validazione sta in funzioni pure testabili; le rotte sono gusci sottili, come il resto del progetto.

**Tech Stack:** Cloudflare Workers, R2, Turnstile, Terraform (provider 5.13.0), Vite 8, vitest.

**Spec:** [docs/maintainers/superpowers/specs/2026-09-20-contatti-about-design.md](../specs/2026-09-20-contatti-about-design.md)

**Questo piano copre il primo dei due sottosistemi della spec.** Il secondo — selettore foto a due modi, campi about su R2, ridisegno della pagina fusa — avrà un piano proprio. Alla fine di questo, la pagina `/contatti` è quella di oggi con un backend nuovo.

## Global Constraints

Dal `CLAUDE.md` di `/srv/claude/workspaces/`:

- **Mai `git push --force`**, mai cancellare rami remoti, mai `--no-verify`. Push bloccato → fermarsi e segnalare.
- **Mai committare su `main`.** Branch dedicato e PR; il merge lo decide una persona.
- Si lavora solo dentro `/srv/claude/workspaces/`. Ogni file cancellato va dichiarato, con il motivo.
- **Non leggere, copiare o stampare credenziali.**
- Identità commit `VPS Agent <agent@vps-agent.invalid>`, già globale.

Ogni commit termina con:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Vincoli tecnici e di sicurezza, dalla spec:

- **La notifica non contiene mai il testo del messaggio** (spec §4). I topic pubblici di ntfy sono leggibili da chiunque ne indovini il nome.
- **`CONTACT_NOTIFY_URL` e `TURNSTILE_SECRET` sono secret del Worker, non `vars`** (spec §4 e §6.2): `wrangler.json` è versionato.
- **La sitekey di Turnstile è pubblica** e va in `wrangler.json` come `var`.
- **Non si registrano IP né user agent** (spec §3).
- **Il fallimento della notifica non fa fallire l'invio** (spec §4).
- **Mai `terraform apply` né `plan`** da un agente. Solo `validate` e `fmt`.
- `npm run build` da solo fallisce apposta: usare `ALLOW_PLACEHOLDER_CSP=1 npm run build`.
- Branch: `contatti-form-interno`, da `main` **dopo** il merge della PR del punto 4. Se `src/utils/formatText.js` non esiste su `main`, fermarsi e segnalare.
- Test di partenza: **297**.

## Stato di partenza verificato

Verificato sul codice il 2026-09-20:

- `src/worker.js` smista: `/api/data/` → `data-routes`, `/api/admin/` → `admin-routes`, poi pagine statiche, poi la regex degli album. **Le API vanno inserite prima della regex**, altrimenti cadono lì dentro.
- `src/worker/http.js` espone `jsonResponse(data, status)` con `Cache-Control: no-store`.
- `src/worker/test-helpers.js` espone `makeFakeBucket(initial)` con `get`, `put`, `delete` e `list({prefix, cursor, limit})` con cursore per chiave, e `makeJwtTestKit()` per i token di Access.
- `src/shared/content-rules.js` contiene i validatori di forma, con l'idioma `fail(messaggio)` / `OK`.
- `/api/data/config` espone già `r2PublicUrl` a runtime: è il canale giusto anche per la sitekey.
- Il form ha già l'honeypot `botcheck`.

---

## File Structure

| File | Responsabilità |
|---|---|
| `src/shared/contact-rules.js` | nuovo: validazione del messaggio, limiti di lunghezza |
| `src/shared/contact-rules.test.js` | nuovo |
| `src/utils/buildMessage.js` | nuovo: input → oggetto da salvare, e nome dell'oggetto R2 |
| `src/utils/buildMessage.test.js` | nuovo |
| `src/utils/notifyBody.js` | nuovo: messaggio → testo della notifica, **senza il contenuto** |
| `src/utils/notifyBody.test.js` | nuovo |
| `src/worker/contact-routes.js` | nuovo: la rotta pubblica, guscio sottile |
| `src/worker/contact-routes.test.js` | nuovo |
| `src/worker/turnstile.js` | nuovo: verifica del token lato server |
| `src/worker/turnstile.test.js` | nuovo |
| `src/worker.js` | smista `/api/contact` |
| `src/worker/admin-routes.js` | rotte elenco e cancellazione messaggi |
| `src/worker/data-routes.js` | `/api/data/config` espone anche la sitekey |
| `src/admin/views/messages.js` | nuova vista della dashboard |
| `src/admin/router.js`, `src/pages/admin.js` | la registrano |
| `src/components/ContactForm.js` | punta al Worker, monta Turnstile |
| `config/texts.config.js` | testi del form e della vista Messaggi |
| `infra/turnstile.tf` | nuovo: il widget |
| `wrangler.example.json` | `TURNSTILE_SITEKEY` |

Cancellati: `web3formsAccessKey` da `config/site.config.js`, `VITE_WEB3FORMS_ACCESS_KEY` da `.env.example`.

---

### Task 1: Le regole del messaggio

Funzioni pure. Nessuna rete, nessun DOM: sono le decisioni, e vanno testate da sole.

**Files:**
- Create: `src/shared/contact-rules.js`, `src/shared/contact-rules.test.js`

**Interfaces:**
- Consumes: niente
- Produces: `validateContactShape(data) → { ok: true } | { ok: false, error: string }`, e le costanti `LIMITS`

- [ ] **Step 1: Creare il branch**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git checkout main && git pull --ff-only
test -f src/utils/formatText.js || { echo "STOP: il punto 4 non e' su main"; exit 1; }
git checkout -b contatti-form-interno
```

- [ ] **Step 2: Scrivere il test che fallisce**

`src/shared/contact-rules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { validateContactShape, LIMITS } from './contact-rules.js';

const valido = { name: 'Mario', email: 'mario@esempio.it', message: 'Ciao' };

describe('validateContactShape', () => {
  it('accetta i tre campi obbligatori', () => {
    expect(validateContactShape(valido).ok).toBe(true);
  });

  it('accetta subject facoltativo', () => {
    expect(validateContactShape({ ...valido, subject: 'Matrimonio' }).ok).toBe(true);
  });

  it('rifiuta se manca un campo obbligatorio, dicendo quale', () => {
    for (const campo of ['name', 'email', 'message']) {
      const { [campo]: _, ...senza } = valido;
      const r = validateContactShape(senza);
      expect(r.ok).toBe(false);
      expect(r.error).toContain(campo);
    }
  });

  it('rifiuta campi di soli spazi', () => {
    expect(validateContactShape({ ...valido, name: '   ' }).ok).toBe(false);
  });

  it('rifiuta un email senza forma di email', () => {
    for (const email of ['mario', 'mario@', '@esempio.it', 'mario esempio.it']) {
      expect(validateContactShape({ ...valido, email }).ok).toBe(false);
    }
  });

  it('rifiuta oltre i limiti di lunghezza', () => {
    expect(validateContactShape({ ...valido, message: 'x'.repeat(LIMITS.message + 1) }).ok).toBe(false);
    expect(validateContactShape({ ...valido, name: 'x'.repeat(LIMITS.name + 1) }).ok).toBe(false);
    expect(validateContactShape({ ...valido, subject: 'x'.repeat(LIMITS.subject + 1) }).ok).toBe(false);
  });

  it('accetta esattamente al limite', () => {
    expect(validateContactShape({ ...valido, message: 'x'.repeat(LIMITS.message) }).ok).toBe(true);
  });

  it('rifiuta un input che non e un oggetto', () => {
    for (const x of [null, 'stringa', 42, []]) {
      expect(validateContactShape(x).ok).toBe(false);
    }
  });

  it('rifiuta campi di tipo sbagliato', () => {
    expect(validateContactShape({ ...valido, message: 42 }).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca**

Run: `npx vitest run src/shared/contact-rules.test.js`
Atteso: FAIL, `Failed to resolve import "./contact-rules.js"`.

- [ ] **Step 4: Implementare**

`src/shared/contact-rules.js`:

```js
// Regole del messaggio di contatto, condivise fra Worker e client.
// La rotta /api/contact e' l'unica scrittura non autenticata del sistema:
// i limiti di lunghezza servono a impedire che un corpo enorme arrivi a R2.

export const LIMITS = { name: 100, email: 254, subject: 200, message: 5000 };

// Volutamente permissiva: convalidare un'email secondo lo standard e'
// impossibile in una regex, e rifiutare indirizzi validi e' peggio che
// accettarne uno finto, che tanto non ricevera' mai la risposta.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = error => ({ ok: false, error });
const OK = { ok: true };

function stringaValida(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

/**
 * @param {unknown} data
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateContactShape(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return fail('contact: shape invalida');
  }

  for (const campo of ['name', 'message']) {
    if (!stringaValida(data[campo], LIMITS[campo])) return fail(`${campo} mancante o troppo lungo`);
  }

  if (!stringaValida(data.email, LIMITS.email) || !EMAIL_RE.test(data.email)) {
    return fail('email mancante o non valida');
  }

  if (data.subject !== undefined && !stringaValida(data.subject, LIMITS.subject)) {
    return fail('subject non valido');
  }

  return OK;
}
```

- [ ] **Step 5: Eseguire e verificare che passino**

Run: `npx vitest run src/shared/contact-rules.test.js`
Atteso: 9 test PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/contact-rules.js src/shared/contact-rules.test.js
git commit -F - <<'EOF'
feat(contact): regole di validazione del messaggio

La rotta /api/contact sara' l'unica scrittura non autenticata del
sistema: i limiti di lunghezza esistono perche' un corpo enorme non
arrivi mai a toccare R2.

La validazione dell'email e' volutamente permissiva: convalidarla
davvero in una regex non si puo', e rifiutare un indirizzo valido e'
peggio che accettarne uno finto, che tanto non ricevera' risposta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Costruire il messaggio e il suo nome

**Files:**
- Create: `src/utils/buildMessage.js`, `src/utils/buildMessage.test.js`

**Interfaces:**
- Consumes: `LIMITS` dal Task 1
- Produces: `buildMessage(input, now) → object`, `messageKey(now, rand) → string`

- [ ] **Step 1: Scrivere il test che fallisce**

`src/utils/buildMessage.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildMessage, messageKey } from './buildMessage.js';

const NOW = 1_800_000_000_000;

describe('buildMessage', () => {
  it('tiene i campi e aggiunge receivedAt', () => {
    const m = buildMessage({ name: 'Mario', email: 'm@e.it', message: 'Ciao' }, NOW);
    expect(m).toEqual({ name: 'Mario', email: 'm@e.it', message: 'Ciao', receivedAt: NOW });
  });

  it('include subject solo se valorizzato', () => {
    const con = buildMessage({ name: 'M', email: 'm@e.it', message: 'C', subject: 'X' }, NOW);
    expect(con.subject).toBe('X');
    const senza = buildMessage({ name: 'M', email: 'm@e.it', message: 'C', subject: '  ' }, NOW);
    expect('subject' in senza).toBe(false);
  });

  it('toglie gli spazi ai bordi', () => {
    const m = buildMessage({ name: '  Mario  ', email: ' m@e.it ', message: ' Ciao ' }, NOW);
    expect(m.name).toBe('Mario');
    expect(m.email).toBe('m@e.it');
    expect(m.message).toBe('Ciao');
  });

  it('non porta con se campi estranei', () => {
    const m = buildMessage({ name: 'M', email: 'm@e.it', message: 'C', botcheck: 'x', ip: '1.2.3.4' }, NOW);
    expect('botcheck' in m).toBe(false);
    expect('ip' in m).toBe(false);
  });
});

describe('messageKey', () => {
  it('sta sotto _messages/ ed e un json', () => {
    const k = messageKey(NOW, 'a7f3k2');
    expect(k.startsWith('_messages/')).toBe(true);
    expect(k.endsWith('.json')).toBe(true);
  });

  it('e ordinabile per data: prima viene prima', () => {
    const a = messageKey(NOW, 'aaaaaa');
    const b = messageKey(NOW + 60_000, 'aaaaaa');
    expect([b, a].sort()).toEqual([a, b]);
  });

  it('non contiene due punti, che in una chiave R2 sono scomodi', () => {
    expect(messageKey(NOW, 'a7f3k2')).not.toContain(':');
  });

  it('due messaggi nello stesso istante hanno chiavi diverse', () => {
    expect(messageKey(NOW, 'aaaaaa')).not.toBe(messageKey(NOW, 'bbbbbb'));
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx vitest run src/utils/buildMessage.test.js`
Atteso: FAIL, `Failed to resolve import "./buildMessage.js"`.

- [ ] **Step 3: Implementare**

`src/utils/buildMessage.js`:

```js
/**
 * Costruisce l'oggetto salvato su R2. Copia solo i campi previsti: cio'
 * che arriva da una rotta pubblica non finisce nello storage per inerzia.
 * Non si registrano IP ne' user agent — sono dati personali che non
 * servono a rispondere a un messaggio (spec §3).
 *
 * @param {{name: string, email: string, message: string, subject?: string}} input
 * @param {number} now - epoch ms
 * @returns {object}
 */
export function buildMessage(input, now) {
  const m = {
    name: input.name.trim(),
    email: input.email.trim(),
    message: input.message.trim(),
    receivedAt: now,
  };
  const subject = input.subject?.trim();
  if (subject) m.subject = subject;
  return m;
}

/**
 * Chiave R2 del messaggio. Il prefisso ordinabile per data rende
 * l'elenco della dashboard una `list` con prefix, senza indice da
 * mantenere; il suffisso casuale evita collisioni nello stesso secondo.
 *
 * @param {number} now - epoch ms
 * @param {string} rand - suffisso casuale
 * @returns {string}
 */
export function messageKey(now, rand) {
  // I due punti dell'ISO non sono vietati in R2, ma rendono scomode le
  // chiavi in URL e shell: si sostituiscono con trattini.
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  return `_messages/${stamp}-${rand}.json`;
}
```

- [ ] **Step 4: Eseguire e verificare che passino**

Run: `npx vitest run src/utils/buildMessage.test.js`
Atteso: 8 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/buildMessage.js src/utils/buildMessage.test.js
git commit -m "feat(contact): costruzione del messaggio e della sua chiave R2

Copia solo i campi previsti: cio' che arriva da una rotta pubblica non
deve finire nello storage per inerzia. Niente IP ne' user agent, come
da spec.

La chiave e' ordinabile per data, cosi' l'elenco della dashboard e' una
list con prefix e non serve tenere un indice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 3: Il corpo della notifica

Piccolo ma a sé, perché porta una garanzia di sicurezza: **il messaggio non esce di lì**.

**Files:**
- Create: `src/utils/notifyBody.js`, `src/utils/notifyBody.test.js`

**Interfaces:**
- Consumes: l'oggetto del Task 2
- Produces: `notifyBody(message, adminUrl) → string`

- [ ] **Step 1: Scrivere il test che fallisce**

`src/utils/notifyBody.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { notifyBody } from './notifyBody.js';

const M = {
  name: 'Mario Rossi',
  email: 'mario@esempio.it',
  subject: 'Matrimonio a giugno',
  message: 'SEGRETISSIMO: questo testo non deve uscire',
  receivedAt: 1_800_000_000_000,
};

describe('notifyBody', () => {
  it('dice chi ha scritto', () => {
    expect(notifyBody(M, 'https://sito.it/admin')).toContain('Mario Rossi');
  });

  it('NON contiene il testo del messaggio', () => {
    // I topic pubblici di ntfy sono leggibili da chiunque ne indovini il
    // nome: mandarci il messaggio sarebbe una fuga di dati (spec §4).
    expect(notifyBody(M, 'https://sito.it/admin')).not.toContain('SEGRETISSIMO');
  });

  it('NON contiene l email di chi scrive', () => {
    expect(notifyBody(M, 'https://sito.it/admin')).not.toContain('mario@esempio.it');
  });

  it('rimanda alla dashboard', () => {
    expect(notifyBody(M, 'https://sito.it/admin')).toContain('https://sito.it/admin');
  });

  it('funziona anche senza subject', () => {
    const { subject: _, ...senza } = M;
    expect(() => notifyBody(senza, 'https://sito.it/admin')).not.toThrow();
  });

  it('non lascia passare un nome lunghissimo', () => {
    const lungo = { ...M, name: 'x'.repeat(500) };
    expect(notifyBody(lungo, 'https://sito.it/admin').length).toBeLessThan(300);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx vitest run src/utils/notifyBody.test.js`
Atteso: FAIL, `Failed to resolve import "./notifyBody.js"`.

- [ ] **Step 3: Implementare**

`src/utils/notifyBody.js`:

```js
const MAX_NOME = 80;

/**
 * Testo della notifica. Contiene chi ha scritto e dove andare a leggere,
 * MAI il messaggio ne' l'email di chi scrive: la notifica puo' finire su
 * un canale pubblico — un topic ntfy e' leggibile da chiunque ne indovini
 * il nome — e quello che esce di qui non si riprende piu'.
 *
 * @param {{name: string}} message
 * @param {string} adminUrl
 * @returns {string}
 */
export function notifyBody(message, adminUrl) {
  const nome = String(message.name).slice(0, MAX_NOME);
  return `Nuovo messaggio da ${nome}. Leggilo su ${adminUrl}`;
}
```

- [ ] **Step 4: Eseguire e verificare che passino**

Run: `npx vitest run src/utils/notifyBody.test.js`
Atteso: 6 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/notifyBody.js src/utils/notifyBody.test.js
git commit -m "feat(contact): corpo della notifica, senza il messaggio dentro

Tre dei sei test verificano cosa NON esce: il testo del messaggio e
l'email di chi scrive. La notifica puo' finire su un canale pubblico —
un topic ntfy lo legge chiunque ne indovini il nome — e una garanzia di
sicurezza non verificata scade alla prima modifica distratta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 4: Verifica di Turnstile

**Files:**
- Create: `src/worker/turnstile.js`, `src/worker/turnstile.test.js`

**Interfaces:**
- Consumes: niente
- Produces: `verifyTurnstile(token, secret, fetchImpl) → Promise<boolean>`

- [ ] **Step 1: Scrivere il test che fallisce**

`src/worker/turnstile.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { verifyTurnstile } from './turnstile.js';

const okFetch = async () => new Response(JSON.stringify({ success: true }));
const koFetch = async () => new Response(JSON.stringify({ success: false }));

describe('verifyTurnstile', () => {
  it('passa quando Cloudflare risponde success', async () => {
    expect(await verifyTurnstile('tok', 'sec', okFetch)).toBe(true);
  });

  it('blocca quando Cloudflare risponde success:false', async () => {
    expect(await verifyTurnstile('tok', 'sec', koFetch)).toBe(false);
  });

  it('senza secret la verifica e disattivata e passa', async () => {
    // Turnstile e' opzionale: chi non lo configura deve avere un form
    // funzionante, non uno che rifiuta tutto.
    expect(await verifyTurnstile('', '', okFetch)).toBe(true);
  });

  it('con secret ma senza token blocca', async () => {
    expect(await verifyTurnstile('', 'sec', okFetch)).toBe(false);
  });

  it('blocca se la chiamata a Cloudflare fallisce', async () => {
    const rotto = async () => { throw new Error('rete'); };
    expect(await verifyTurnstile('tok', 'sec', rotto)).toBe(false);
  });

  it('blocca se Cloudflare risponde con qualcosa che non e JSON', async () => {
    const strano = async () => new Response('<html>errore</html>');
    expect(await verifyTurnstile('tok', 'sec', strano)).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx vitest run src/worker/turnstile.test.js`
Atteso: FAIL, `Failed to resolve import "./turnstile.js"`.

- [ ] **Step 3: Implementare**

`src/worker/turnstile.js`:

```js
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verifica il token Turnstile presso Cloudflare.
 *
 * Senza secret la verifica e' disattivata e passa: Turnstile e'
 * opzionale, e chi sceglie di non usarlo deve avere un form che
 * funziona, non uno che rifiuta tutti. Con il secret configurato,
 * invece, qualunque incertezza blocca — un errore di rete verso
 * Cloudflare non e' un buon motivo per accettare un invio non
 * verificato.
 *
 * @param {string} token - dal campo cf-turnstile-response
 * @param {string} secret - TURNSTILE_SECRET, vuoto = disattivato
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstile(token, secret, fetchImpl = fetch) {
  if (!secret) return true;
  if (!token) return false;

  try {
    const res = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const data = await res.json();
    return data?.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Eseguire e verificare che passino**

Run: `npx vitest run src/worker/turnstile.test.js`
Atteso: 6 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/turnstile.js src/worker/turnstile.test.js
git commit -m "feat(contact): verifica del token Turnstile

Senza secret la verifica passa: Turnstile e' opzionale e chi non lo usa
deve avere un form funzionante. Con il secret configurato, invece, ogni
incertezza blocca — un errore di rete verso Cloudflare non e' un motivo
per accettare un invio non verificato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 5: La rotta pubblica

Guscio sottile che mette insieme i quattro pezzi precedenti.

**Files:**
- Create: `src/worker/contact-routes.js`, `src/worker/contact-routes.test.js`
- Modify: `src/worker.js`

**Interfaces:**
- Consumes: `validateContactShape`, `buildMessage`, `messageKey`, `notifyBody`, `verifyTurnstile`
- Produces: `handleContactRequest(request, env, deps) → Promise<Response>`

- [ ] **Step 1: Scrivere il test che fallisce**

`src/worker/contact-routes.test.js`:

```js
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

  it('se la notifica fallisce il messaggio resta salvato e la risposta e 200', async () => {
    // Un visitatore non deve vedere "invio fallito" perche' il telefono
    // del proprietario era irraggiungibile (spec §4).
    const env = makeEnv();
    const deps = makeDeps({ notify: async () => { throw new Error('webhook giu'); } });
    const res = await post(env, VALIDO, deps);
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.size).toBe(1);
  });

  it('rifiuta un corpo enorme senza leggerlo tutto', async () => {
    const env = makeEnv();
    const res = await post(env, { ...VALIDO, message: 'x'.repeat(100_000) });
    expect(res.status).toBe(400);
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('non salva i campi estranei arrivati dal client', async () => {
    const env = makeEnv();
    await post(env, { ...VALIDO, receivedAt: 1, ip: '1.2.3.4' });
    const salvato = JSON.parse([...env.BUCKET.store.values()][0].text);
    expect(salvato.receivedAt).toBe(NOW);
    expect('ip' in salvato).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx vitest run src/worker/contact-routes.test.js`
Atteso: FAIL, `Failed to resolve import "./contact-routes.js"`.

- [ ] **Step 3: Implementare**

`src/worker/contact-routes.js`:

```js
// L'unica scrittura non autenticata del sistema. Ogni controllo qui
// dentro esiste perche' chiunque puo' chiamare questa rotta.
import { jsonResponse } from './http.js';
import { validateContactShape } from '../shared/contact-rules.js';
import { buildMessage, messageKey } from '../utils/buildMessage.js';
import { notifyBody } from '../utils/notifyBody.js';
import { verifyTurnstile } from './turnstile.js';

const MAX_BODY = 16 * 1024;
const NOTIFY_TIMEOUT_MS = 3000;

function randSuffix() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
}

async function inviaNotifica(env, messaggio) {
  const url = env.CONTACT_NOTIFY_URL;
  if (!url) return;
  const adminUrl = `${env.SITE_URL ?? ''}/admin`;
  await fetch(url, {
    method: 'POST',
    body: notifyBody(messaggio, adminUrl),
    signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
  });
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {{now?: () => number, rand?: () => string, notify?: Function, verify?: Function}} deps
 */
export async function handleContactRequest(request, env, deps = {}) {
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const now = deps.now ?? Date.now;
  const rand = deps.rand ?? randSuffix;
  const notify = deps.notify ?? inviaNotifica;
  const verify = deps.verify ?? ((token) => verifyTurnstile(token, env.TURNSTILE_SECRET ?? ''));

  const raw = await request.text();
  if (raw.length > MAX_BODY) return jsonResponse({ error: 'TOO_LARGE' }, 400);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  // Honeypot: risponde 200 di proposito. Un bot che riceve un errore
  // riprova cambiando qualcosa; uno che riceve successo se ne va.
  if (data?.botcheck) return jsonResponse({ ok: true });

  if (!(await verify(data?.['cf-turnstile-response'] ?? ''))) {
    return jsonResponse({ error: 'CHALLENGE_FAILED' }, 403);
  }

  const esito = validateContactShape(data);
  if (!esito.ok) return jsonResponse({ error: 'INVALID', detail: esito.error }, 400);

  const messaggio = buildMessage(data, now());
  await env.BUCKET.put(messageKey(now(), rand()), JSON.stringify(messaggio), {
    httpMetadata: { contentType: 'application/json' },
  });

  // Il messaggio e' gia' al sicuro: se la notifica fallisce, il
  // visitatore non deve saperlo ne' subirne le conseguenze.
  try {
    await notify(env, messaggio);
  } catch (err) {
    console.error('notifica fallita:', err?.message);
  }

  return jsonResponse({ ok: true });
}
```

- [ ] **Step 4: Collegare la rotta in `src/worker.js`**

Aggiungere l'import e il ramo **prima** della regex degli album, accanto agli altri `/api/`:

```js
import { handleContactRequest } from './worker/contact-routes.js'
```

```js
    if (pathname === '/api/contact') {
      return handleContactRequest(request, env)
    }
```

- [ ] **Step 5: Eseguire i test**

Run: `npm test`
Atteso: tutti verdi. Riferire il totale, che parte da 297 e cresce di circa 40 fra i Task 1–5.

- [ ] **Step 6: Commit**

```bash
git add src/worker/contact-routes.js src/worker/contact-routes.test.js src/worker.js
git commit -F - <<'EOF'
feat(worker): rotta pubblica POST /api/contact

Unica scrittura non autenticata del sistema: ogni controllo esiste
perche' chiunque puo' chiamarla. Tetto sul corpo prima di leggerlo,
honeypot, Turnstile, validazione, e solo allora R2.

L'honeypot risponde 200 di proposito: un bot che riceve un errore
riprova cambiando qualcosa, uno che riceve successo se ne va.

La notifica e' avvolta in un try/catch dopo la scrittura: il messaggio
e' gia' al sicuro, e un visitatore non deve vedere "invio fallito"
perche' il telefono del proprietario era irraggiungibile.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Elenco e cancellazione dal Worker

**Files:**
- Modify: `src/worker/admin-routes.js`, `src/worker/admin-routes.test.js`

**Interfaces:**
- Consumes: le chiavi `_messages/` scritte dal Task 5
- Produces: `GET /api/admin/messages` → `{ messages: [{ id, ...messaggio }] }`; `DELETE /api/admin/messages/<id>`

- [ ] **Step 1: Scrivere i test che falliscono**

Aggiungere in `src/worker/admin-routes.test.js`:

```js
describe('messaggi', () => {
  const M1 = { name: 'Mario', email: 'm@e.it', message: 'Primo', receivedAt: 1000 };
  const M2 = { name: 'Lucia', email: 'l@e.it', message: 'Secondo', receivedAt: 2000 };

  it('elenca i messaggi, dal piu recente', async () => {
    const env = makeEnv({
      '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1,
      '_messages/2026-02-01T00-00-00-000Z-bbb.json': M2,
    });
    const res = await call(env, 'GET', '/api/admin/messages');
    expect(res.status).toBe(200);
    const { messages } = await res.json();
    expect(messages.map(m => m.name)).toEqual(['Lucia', 'Mario']);
    expect(messages[0].id).toBe('2026-02-01T00-00-00-000Z-bbb');
  });

  it('elenco vuoto quando non ce ne sono', async () => {
    const res = await call(makeEnv(), 'GET', '/api/admin/messages');
    expect((await res.json()).messages).toEqual([]);
  });

  it('non tira dentro oggetti che non sono messaggi', async () => {
    const env = makeEnv({ '_site/site.json': SITE, '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const { messages } = await (await call(env, 'GET', '/api/admin/messages')).json();
    expect(messages).toHaveLength(1);
  });

  it('cancella un messaggio', async () => {
    const env = makeEnv({ '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const res = await call(env, 'DELETE', '/api/admin/messages/2026-01-01T00-00-00-000Z-aaa');
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('un id con una barra non puo uscire da _messages/', async () => {
    const env = makeEnv({ '_site/site.json': SITE });
    const res = await call(env, 'DELETE', '/api/admin/messages/..%2F_site%2Fsite.json');
    expect(res.status).toBe(400);
    expect(env.BUCKET.store.has('_site/site.json')).toBe(true);
  });

  it('senza token di Access non si elencano i messaggi', async () => {
    const env = makeEnv({ '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const res = await handleAdminRequest(
      new Request('https://x.dev/api/admin/messages', { method: 'GET' }), env, deps);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run src/worker/admin-routes.test.js`
Atteso: i sei nuovi test falliscono con 404, perché le rotte non esistono.

- [ ] **Step 3: Implementare**

In `src/worker/admin-routes.js`, dentro il gestore già autenticato, aggiungere:

```js
const MESSAGE_ID_RE = /^[A-Za-z0-9-]+$/;
const MESSAGES_PREFIX = '_messages/';
```

```js
  if (pathname === '/api/admin/messages' && request.method === 'GET') {
    const { objects } = await env.BUCKET.list({ prefix: MESSAGES_PREFIX });
    const messages = [];
    for (const { key } of objects) {
      const obj = await env.BUCKET.get(key);
      if (!obj) continue;
      messages.push({ id: key.slice(MESSAGES_PREFIX.length, -'.json'.length), ...(await obj.json()) });
    }
    // Le chiavi sono ordinabili per data: invertirle basta, senza guardare receivedAt.
    messages.reverse();
    return jsonResponse({ messages });
  }

  const delMsg = pathname.match(/^\/api\/admin\/messages\/(.+)$/);
  if (delMsg && request.method === 'DELETE') {
    const id = decodeURIComponent(delMsg[1]);
    // L'id finisce dentro una chiave R2: senza questo controllo un id
    // con barre o punti puo' uscire da _messages/ e cancellare altro.
    if (!MESSAGE_ID_RE.test(id)) return jsonResponse({ error: 'INVALID_ID' }, 400);
    await env.BUCKET.delete(`${MESSAGES_PREFIX}${id}.json`);
    return jsonResponse({ ok: true });
  }
```

- [ ] **Step 4: Eseguire i test**

Run: `npm test`
Atteso: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add src/worker/admin-routes.js src/worker/admin-routes.test.js
git commit -F - <<'EOF'
feat(worker): elenco e cancellazione dei messaggi, dietro Access

L'elenco sfrutta le chiavi ordinabili per data: basta invertirle, senza
leggere receivedAt.

L'id della cancellazione e' vincolato a una regex prima di entrare in
una chiave R2. Senza, un id con barre o punti uscirebbe da _messages/ e
cancellerebbe altro: c'e' un test che prova proprio a raggiungere
_site/site.json.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: La sezione Messaggi nella dashboard

**Files:**
- Create: `src/admin/views/messages.js`, `src/admin/views/messages.test.js`
- Modify: `src/admin/router.js`, `src/pages/admin.js`, `src/admin/api.js`, `config/texts.config.js`, `src/styles/admin.css`

**Interfaces:**
- Consumes: `GET /api/admin/messages`, `DELETE /api/admin/messages/<id>`
- Produces: la vista `#/messages`

- [ ] **Step 1: Aggiungere i testi**

In `config/texts.config.js`, dentro `admin`:

```js
    messages: {
      sectionTitle: 'Messaggi',
      empty: 'Nessun messaggio ricevuto.',
      loadError: 'Impossibile caricare i messaggi.',
      confirmDelete: 'Eliminare il messaggio di {nome}?',
      deleted: 'Messaggio eliminato.',
      reply: 'Rispondi',
      delete: 'Elimina',
    },
```

- [ ] **Step 2: Scrivere il test che fallisce**

`src/admin/views/messages.test.js`, seguendo lo schema dei test delle altre viste:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderMessages } from './messages.js';
import { texts } from '../../../config/texts.config.js';

const M = [
  { id: 'b', name: 'Lucia', email: 'l@e.it', message: 'Secondo', receivedAt: 2000 },
  { id: 'a', name: 'Mario', email: 'm@e.it', subject: 'Matrimonio', message: 'Primo', receivedAt: 1000 },
];

let root, deps;
beforeEach(() => {
  root = document.createElement('div');
  deps = {
    api: { listMessages: vi.fn(async () => ({ ok: true, data: { messages: M } })),
           deleteMessage: vi.fn(async () => ({ ok: true })) },
    confirm: () => true,
    say: vi.fn(),
  };
});

describe('renderMessages', () => {
  it('mostra un elemento per messaggio, con nome e testo', async () => {
    await renderMessages(root, deps, texts);
    expect(root.querySelectorAll('.admin-message')).toHaveLength(2);
    expect(root.textContent).toContain('Lucia');
    expect(root.textContent).toContain('Secondo');
  });

  it('mostra il subject quando c e', async () => {
    await renderMessages(root, deps, texts);
    expect(root.textContent).toContain('Matrimonio');
  });

  it('offre un mailto per rispondere', async () => {
    await renderMessages(root, deps, texts);
    const link = root.querySelector('a[href^="mailto:"]');
    expect(link.getAttribute('href')).toContain('l@e.it');
  });

  it('elimina un messaggio e lo toglie dall elenco', async () => {
    await renderMessages(root, deps, texts);
    root.querySelector('.admin-message__delete').click();
    await vi.waitFor(() => expect(deps.api.deleteMessage).toHaveBeenCalledWith('b'));
  });

  it('non elimina se l utente annulla', async () => {
    deps.confirm = () => false;
    await renderMessages(root, deps, texts);
    root.querySelector('.admin-message__delete').click();
    expect(deps.api.deleteMessage).not.toHaveBeenCalled();
  });

  it('mostra il messaggio di elenco vuoto', async () => {
    deps.api.listMessages = async () => ({ ok: true, data: { messages: [] } });
    await renderMessages(root, deps, texts);
    expect(root.textContent).toContain(texts.admin.messages.empty);
  });

  it('avvisa se il caricamento fallisce', async () => {
    deps.api.listMessages = async () => ({ ok: false });
    await renderMessages(root, deps, texts);
    expect(deps.say).toHaveBeenCalledWith(texts.admin.messages.loadError, true);
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca**

Run: `npx vitest run src/admin/views/messages.test.js`
Atteso: FAIL, `Failed to resolve import "./messages.js"`.

- [ ] **Step 4: Implementare la vista**

`src/admin/views/messages.js`: elenco di `.admin-message`, ciascuno con nome, eventuale subject, data formattata con `siteConfig.language` come nelle altre viste, testo del messaggio, un link `mailto:` e un bottone Elimina che usa `deps.confirm` e `formatText(texts.admin.messages.confirmDelete, { nome })`.

Aggiungere in `src/admin/api.js` i due metodi `listMessages()` e `deleteMessage(id)`, con lo stesso schema degli altri.

Registrare la rotta `#/messages` in `src/admin/router.js` e collegarla in `src/pages/admin.js`, aggiungendo la voce nella top bar accanto ad Album.

Lo stile va in `src/styles/admin.css` usando **solo** i token: `grep` di esadecimali e `rgba(` in `src/styles/` deve restare vuoto, come stabilito nel punto 4.

- [ ] **Step 5: Eseguire test e build**

```bash
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build
grep -rn '#[0-9a-fA-F]\{3,6\}\b\|rgba(' src/styles/*.css || echo "PULITO"
```

Atteso: test verdi, build ok, `PULITO`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(admin): sezione Messaggi nella dashboard

I messaggi arrivati dal form si leggono qui, accanto agli album, dietro
lo stesso Access. Ogni messaggio ha un mailto per rispondere e un
bottone per eliminarlo: senza la cancellazione non si potrebbero
conservare dati personali di altre persone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 8: Il form punta al Worker, e Web3Forms sparisce

**Files:**
- Modify: `src/components/ContactForm.js`, `src/components/ContactForm.test.js`, `config/site.config.js`, `config/texts.config.js`, `.env.example`, `src/worker/data-routes.js`, `wrangler.example.json`, `README.md`, `README.it.md`, `CUSTOMIZING.md`

**Interfaces:**
- Consumes: `POST /api/contact`, e `turnstileSitekey` da `/api/data/config`
- Produces: nessuna nuova interfaccia

- [ ] **Step 1: Esporre la sitekey a runtime**

In `src/worker/data-routes.js`, nella risposta di `/api/data/config`:

```js
    return jsonResponse({
      r2PublicUrl: env.R2_PUBLIC_URL ?? null,
      turnstileSitekey: env.TURNSTILE_SITEKEY ?? null,
    });
```

Aggiungere `"TURNSTILE_SITEKEY": ""` ai `vars` di `wrangler.example.json`, in entrambi gli ambienti. **Vuoto significa Turnstile spento**, ed è il default del template.

Il validatore `validateConfigShape` in `src/shared/content-rules.js` va allineato al campo nuovo, altrimenti la fetch della config fallisce come `MALFORMED`.

- [ ] **Step 2: Aggiornare i test del form**

In `src/components/ContactForm.test.js`, sostituire le asserzioni su `api.web3forms.com` con `/api/contact`, e aggiungere:

```js
  it('invia a /api/contact, non a un servizio esterno', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    // …monta il form con fetchSpy e invia…
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/contact');
  });

  it('manda anche il campo subject quando compilato', async () => {
    // …compila subject e invia…
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).subject).toBe('Matrimonio');
  });

  it('non manda subject quando vuoto', async () => {
    expect('subject' in JSON.parse(fetchSpy.mock.calls[0][1].body)).toBe(false);
  });
```

- [ ] **Step 3: Riscrivere `ContactForm.js`**

- Rimuovere `WEB3FORMS_URL` e il campo nascosto `access_key`.
- Aggiungere il campo `subject`, facoltativo, con etichetta da `texts`.
- `POST` a `/api/contact` con `Content-Type: application/json`, corpo `{ name, email, subject?, message, 'cf-turnstile-response'? }`.
- Mantenere l'honeypot `botcheck`.
- Se `turnstileSitekey` è valorizzata, caricare lo script di Turnstile e montare il widget con **`appearance: 'interaction-only'`, `theme: 'auto'`** (spec §6.1); se è vuota, non caricare nulla.

- [ ] **Step 4: Rimuovere Web3Forms ovunque**

```bash
grep -rn -i 'web3forms' --include='*.js' --include='*.json' --include='*.md' --include='*.example' . | grep -v node_modules | grep -v docs/superpowers
```

Ogni riga va risolta: `web3formsAccessKey` da `config/site.config.js`, `VITE_WEB3FORMS_ACCESS_KEY` da `.env.example`, le menzioni nei due README e in `CUSTOMIZING.md`.

I documenti in `docs/maintainers/superpowers/` **non si toccano**: sono il resoconto storico di decisioni prese allora, e riscriverli falsificherebbe la storia del progetto.

Da dichiarare nel commit: sparisce la dipendenza da un servizio esterno e il passo di setup relativo.

- [ ] **Step 5: Documentare quello che prende il suo posto**

In `CUSTOMIZING.md`, nella tabella "I want to change X":

| **Where contact messages go** | Nowhere to configure — they're stored on R2 and read in the `/admin` dashboard | |
| **Notification on a new message** | `wrangler secret put CONTACT_NOTIFY_URL` | Any service that accepts a POST. See the runbook |
| **Spam protection** | `TURNSTILE_SITEKEY` in `wrangler.json` + `wrangler secret put TURNSTILE_SECRET` | Empty sitekey = off |

Nel runbook, una sezione nuova con le tre ricette di notifica — ntfy.sh, Telegram, Discord — e l'avvertenza che **l'URL va in un secret e non in `wrangler.json`, che è versionato**.

- [ ] **Step 6: Verificare che non resti traccia**

```bash
grep -rn -i 'web3forms' --include='*.js' --include='*.json' --include='*.md' --include='*.example' . | grep -v node_modules | grep -v docs/superpowers || echo "PULITO"
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build
```

Atteso: `PULITO`, test verdi, build ok.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(contact): il form scrive nel nostro Worker, via Web3Forms

Il form fa POST a /api/contact invece che a un servizio esterno. Sparisce
un account da creare per chi clona, sparisce il passo Allowed Domains
che la documentazione aveva perso per strada, e i messaggi smettono di
disperdersi in una casella per stare accanto agli album.

Aggiunto il campo subject, facoltativo. Turnstile si monta solo se la
sitekey e' valorizzata, con appearance interaction-only: per i
visitatori legittimi non compare nulla.

I documenti in docs/maintainers/superpowers/ non sono stati toccati: sono il
resoconto di decisioni prese allora, e riscriverli falsificherebbe la
storia del progetto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Turnstile in Terraform

**Files:**
- Create: `infra/turnstile.tf`
- Modify: `infra/variables.tf`, `infra/outputs.tf`, `infra/terraform.tfvars.example`, `src/utils/renderWrangler.js`, `src/utils/renderWrangler.test.js`, `docs/runbook-cloudflare.md`

**Interfaces:**
- Consumes: `var.account_id`, `var.prod_hostname`, `var.staging_hostname`
- Produces: l'output `turnstile_sitekey`, consumato da `renderWrangler`

- [ ] **Step 1: Dichiarare la variabile**

In `infra/variables.tf`:

```hcl
variable "enable_turnstile" {
  type        = bool
  default     = true
  description = "Crea il widget Turnstile che protegge il form di contatto. A false il form resta protetto solo dall'honeypot."
}
```

- [ ] **Step 2: Dichiarare il widget**

`infra/turnstile.tf`. **Prima di scrivere, confrontare i nomi dei campi con lo schema reale**, come nel punto 1:

```bash
export PATH="$HOME/.local/bin:$PATH"
terraform -chdir=infra providers schema -json > /tmp/schema.json
node -e '
  const s=require("/tmp/schema.json");
  const b=s.provider_schemas["registry.terraform.io/cloudflare/cloudflare"].resource_schemas["cloudflare_turnstile_widget"].block;
  for(const [k,v] of Object.entries(b.attributes||{}))
    console.log(` ${k}: ${v.required?"OBBLIGATORIO":v.computed&&!v.optional?"output":"opzionale"}`);
'
```

```hcl
# Protegge /api/contact, l'unica rotta pubblica che scrive. Modalita'
# managed: il widget compare solo quando Cloudflare sospetta qualcosa,
# grazie ad appearance=interaction-only impostato lato client.
resource "cloudflare_turnstile_widget" "contact" {
  count = var.enable_turnstile ? 1 : 0

  account_id = var.account_id
  name       = "${var.project_name} contact form"
  domains    = compact([var.prod_hostname, var.staging_hostname])
  mode       = "managed"
  region     = "world"
}
```

- [ ] **Step 3: Esporre la sitekey, ma non il secret**

In `infra/outputs.tf`:

```hcl
# Solo la sitekey: e' pubblica e finisce nell'HTML. Il secret NON e' un
# output — va messo a mano con `wrangler secret put TURNSTILE_SECRET`,
# perche' outputs.json viene letto da uno script e non deve contenere
# credenziali.
output "turnstile_sitekey" {
  value = var.enable_turnstile ? cloudflare_turnstile_widget.contact[0].sitekey : ""
}
```

- [ ] **Step 4: Farla arrivare in `wrangler.json`**

In `src/utils/renderWrangler.js`, aggiungere `turnstile_sitekey` alle chiavi gestite e assegnarla a `vars.TURNSTILE_SITEKEY` in entrambi gli ambienti.

**Attenzione**: `CHIAVI_RICHIESTE` fa fallire se una chiave manca. `turnstile_sitekey` può essere la stringa vuota quando Turnstile è spento, quindi **non va aggiunta a quell'elenco** — va gestita con un default. Aggiungere il test:

```js
  it('turnstile spento: sitekey vuota, non un errore', () => {
    const { turnstile_sitekey: _, ...senza } = OUTPUTS;
    const r = renderWrangler(EXAMPLE, senza);
    expect(r.vars.TURNSTILE_SITEKEY).toBe('');
  });
```

- [ ] **Step 5: Validare**

```bash
export PATH="$HOME/.local/bin:$PATH"
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
npm test
```

Atteso: `Success! The configuration is valid.` e test verdi.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(infra): widget Turnstile dichiarato in Terraform

Entra nella catena che esiste gia': terraform produce la sitekey,
renderWrangler la scrive in wrangler.json, il client la usa se c'e'.

Il secret NON e' un output: outputs.json viene letto da uno script e
non deve contenere credenziali. Va messo a mano con wrangler secret
put, e il runbook lo dice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 10 [UMANO]: Applicare e provare davvero

Nessun agente può eseguire questi passi: richiedono credenziali e toccano risorse vere.

- [ ] **Step 1:** `terraform apply` con `enable_turnstile = true`, poi `npm run infra:sync` per portare la sitekey in `wrangler.json`.

- [ ] **Step 2:** Prendere il **secret** del widget dal pannello Turnstile e metterlo con `wrangler secret put TURNSTILE_SECRET`. **Non in `wrangler.json`.**

- [ ] **Step 3:** Scegliere dove ricevere le notifiche. La via più rapida: un topic su [ntfy.sh](https://ntfy.sh/) con un nome **lungo e casuale** — chiunque indovini il nome può leggere le notifiche — e l'app sul telefono. Poi `wrangler secret put CONTACT_NOTIFY_URL`.

- [ ] **Step 4:** Deploy, e prova end-to-end: inviare un messaggio dal sito vero, verificare che arrivi la notifica, che compaia in `/admin`, e che si riesca a eliminarlo.

- [ ] **Step 5: La prova che conta.** Controllare che la notifica ricevuta **non contenga il testo del messaggio**. C'è un test automatico che lo garantisce, ma questa è l'unica verifica sul canale reale.

- [ ] **Step 6:** Aggiungere l'esito a [docs/maintainers/azioni-manuali.md](../../azioni-manuali.md).

---

## Self-Review

**Copertura della spec.** §3 (architettura, forma del messaggio, nomi degli oggetti) → Task 2 e 5. §4 (notifica, secret, niente contenuto, fallimento non bloccante) → Task 3 e 5. §6 (honeypot, Turnstile, limiti, validazione condivisa) → Task 1, 4, 5. §6.1 (interaction-only) → Task 8 Step 3. §6.2 (Terraform, sitekey pubblica e secret separato) → Task 9. §6 dati personali (cancellazione) → Task 6 e 7. §7 campi → Task 1 e 8. §9 migrazione → Task 8. §10 verifica → i test di ogni task, più Task 10 Step 5.

**Fuori da questo piano, come dichiarato in apertura:** §5 (selettore foto a due modi) e §7 struttura della pagina fusa. Sono il secondo sottosistema e avranno un piano proprio.

**Segnaposto.** Nessun TBD. Il Task 7 Step 4 e il Task 8 Step 3 descrivono la vista e il form a parole invece che riga per riga: sono codice di interfaccia che segue schemi già presenti nel repo — le altre viste in `src/admin/views/`, il form attuale — e ricopiarli qui creerebbe una seconda copia destinata a divergere. I test, che sono il contratto, sono dati per esteso.

**Coerenza dei nomi.** `validateContactShape` (Task 1) → usata nel Task 5. `buildMessage` e `messageKey` (Task 2) → Task 5. `notifyBody` (Task 3) → Task 5. `verifyTurnstile` (Task 4) → Task 5. `handleContactRequest` (Task 5) → `worker.js` stesso task. `_messages/` come prefisso in Task 2, 5, 6. `TURNSTILE_SITEKEY` come `var` e `TURNSTILE_SECRET` come secret, con la stessa grafia nei Task 8, 9, 10.

**Un rischio dichiarato.** Il Task 5 introduce l'unica rotta non autenticata che scrive su storage. I test coprono corpo enorme, JSON malformato, honeypot, Turnstile e campi estranei, ma **non c'è rate limiting applicativo**: se Turnstile viene spento, un attaccante può riempire il bucket. Va detto nella documentazione, e chi disattiva Turnstile deve sapere cosa sta accettando. Un limite per IP richiederebbe uno stato condiviso — KV o Durable Objects — e sarebbe un progetto a sé.
