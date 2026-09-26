# M7 — Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere security headers al sito tramite `public/_headers` e rimuovere il modulePreload polyfill di Vite per garantire un `script-src 'self'` stretto senza `'unsafe-inline'`.

**Architecture:** Un file `public/_headers` viene copiato da Vite in `dist/` durante la build e letto da Cloudflare Pages per applicare gli header HTTP a tutte le risposte. La modifica a `vite.config.js` rimuove il polyfill per module preloading (inutile su browser moderni e potenzialmente incompatibile con `script-src 'self'` su alcune versioni di Vite). I due cambiamenti sono un'unica unità di revisione: gli header hanno senso solo con il polyfill rimosso.

**Tech Stack:** Cloudflare Pages `_headers` file, Vite 8.x (`build.modulePreload`).

## Global Constraints

- `public/_headers` usa la sintassi Cloudflare Pages: pattern su riga singola, header indentati con due spazi.
- Il CSP completo (verbatim dalla spec): `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://lh3.googleusercontent.com https://lh3.google.com; connect-src https://www.googleapis.com https://api.web3forms.com; form-action 'self' https://api.web3forms.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests`
- `X-XSS-Protection: 0` — disabilita esplicitamente il vecchio filtro XSS dei browser legacy (IE, vecchio Safari); con una CSP robusta il filtro legacy è un rischio in più (può essere abusato per cross-site leaking), non una protezione
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- I test esistenti devono continuare a passare (86 test, 13 file).
- Nessuna modifica a provider, componenti, HTML delle pagine, o altri file.

---

### Task 1: Security headers + disabilitazione polyfill Vite

**Files:**
- Crea: `public/_headers`
- Modifica: `vite.config.js`

---

- [ ] **Step 1: Verifica stato baseline**

```bash
npm run build 2>&1 | tail -5
```

Expected: build completata, nessun errore. Verifica che `dist/_headers` NON esista ancora:

```bash
ls dist/_headers 2>&1
```

Expected: `ls: dist/_headers: No such file or directory`

- [ ] **Step 2: Modifica `vite.config.js`**

Aprire `vite.config.js` e aggiungere `modulePreload: { polyfill: false }` dentro `build`, mantenendo invariato `rollupOptions`:

```js
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  test: {
    environment: 'jsdom',
  },
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        album: resolve(__dirname, 'album.html'),
        contatti: resolve(__dirname, 'contatti.html'),
      },
    },
  },
})
```

- [ ] **Step 3: Crea `public/_headers`**

Creare il file `public/_headers` con il contenuto seguente (attenzione: ogni header è indentato con **due spazi**):

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://lh3.googleusercontent.com https://lh3.google.com; connect-src https://www.googleapis.com https://api.web3forms.com; form-action 'self' https://api.web3forms.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Frame-Options: DENY
  X-XSS-Protection: 0
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
```

- [ ] **Step 4: Verifica build**

```bash
npm run build 2>&1 | tail -5
```

Expected: build completata senza errori.

Verifica che `dist/_headers` esista e contenga gli header corretti:

```bash
cat dist/_headers
```

Expected output (identico a `public/_headers`):
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://lh3.googleusercontent.com https://lh3.google.com; connect-src https://www.googleapis.com https://api.web3forms.com; form-action 'self' https://api.web3forms.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Frame-Options: DENY
  X-XSS-Protection: 0
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
```

Verifica che i test esistenti passino ancora:

```bash
npm test
```

Expected:
```
Test Files  13 passed (13)
     Tests  86 passed (86)
```

- [ ] **Step 5: Commit**

```bash
git add public/_headers vite.config.js
git commit -m "feat: add security headers and disable modulePreload polyfill"
```

---

## Verifica finale (post-deploy Cloudflare Pages)

Dopo il push e il deploy automatico su Cloudflare Pages, aprire il sito in un browser e verificare manualmente:

1. **DevTools → Network → qualsiasi risposta → Headers** — devono comparire tutti e sei gli header:

| Header | Valore atteso |
|--------|---------------|
| `content-security-policy` | (stringa CSP completa) |
| `strict-transport-security` | `max-age=31536000; includeSubDomains` |
| `x-frame-options` | `DENY` |
| `x-xss-protection` | `0` |
| `x-content-type-options` | `nosniff` |
| `referrer-policy` | `strict-origin-when-cross-origin` |
| `permissions-policy` | `geolocation=(), microphone=(), camera=()` |

2. **DevTools → Console** — nessun errore CSP (nessuna riga rossa che inizia con `Refused to load`).

3. **Funzionalità:** griglia foto, lightbox e form contatti devono funzionare normalmente.
