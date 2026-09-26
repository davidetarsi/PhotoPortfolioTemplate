# M7 — Security Hardening Design Spec

**Date:** 2026-07-07
**Milestone:** M7

---

## Goal

Aggiungere security headers al sito tramite il file `_headers` di Cloudflare Pages e rimuovere il modulePreload polyfill di Vite per rendere possibile una `script-src 'self'` stretto senza `'unsafe-inline'`.

---

## Scope

M7 tocca due file:

| Azione | File |
|--------|------|
| Crea | `public/_headers` |
| Modifica | `vite.config.js` |

Nessuna modifica al provider Drive, al frontend, ai componenti o ai test esistenti.

---

## `public/_headers`

Cloudflare Pages legge questo file dalla cartella `dist/` (Vite lo copia automaticamente da `public/` durante la build) e applica gli header HTTP a tutte le risposte statiche.

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

### Razionale per direttiva

| Direttiva | Effetto |
|-----------|---------|
| `default-src 'self'` | Fallback: ammette solo risorse self-hosted |
| `script-src 'self'` | Esplicito: blocca inline script e script di terze parti. Dichiarato esplicitamente perché un futuro allentamento di `default-src` (es. aggiunta CDN immagini) non spalanchi inavvertitamente anche gli script |
| `style-src 'self' https://fonts.googleapis.com` | Ammette i CSS di Vite (self) + Google Fonts stylesheet |
| `font-src https://fonts.gstatic.com` | Ammette solo i file woff2 di Google Fonts |
| `img-src 'self' data: https://lh3.googleusercontent.com https://lh3.google.com` | Ammette il CDN Google Drive (thumbnailLink) + `data:` per eventuali SVG inline |
| `connect-src https://www.googleapis.com https://api.web3forms.com` | Ammette solo le fetch verso Drive API e Web3Forms |
| `form-action 'self' https://api.web3forms.com` | Limita le destinazioni dei submit HTML nativi a Web3Forms e alla propria origin. `connect-src` copre solo `fetch`/XHR — senza `form-action`, un XSS o un'estensione malevola che modificasse l'attributo `action` del form potrebbe esfiltrare i dati verso qualsiasi server esterno. `'self'` garantisce che form futuri che puntano allo stesso dominio (es. ricerca, booking) non vengano bloccati |
| `X-XSS-Protection: 0` | Disabilita esplicitamente il vecchio filtro XSS dei browser legacy (IE, vecchio Safari). Con una CSP robusta il filtro legacy è un vettore di attacco (cross-site leaking), non una protezione — raccomandazione OWASP |
| `frame-ancestors 'none'` | Impedisce che il sito sia embeddato in iframe (clickjacking) |
| `object-src 'none'` | Blocca Flash e plugin obsoleti |
| `base-uri 'self'` | Impedisce attacchi via `<base href="...">` esterno |
| `upgrade-insecure-requests` | Forza il browser a trasformare link HTTP misti in HTTPS prima del fetch |
| `Strict-Transport-Security: max-age=31536000; includeSubDomains` | Il browser ricorda di non tentare mai HTTP per questo dominio (1 anno). Defense-in-depth rispetto al redirect Cloudflare: la policy è in Git, versionata, e attiva anche prima che l'edge CF risponda |
| `X-Frame-Options: DENY` | Ridondante con `frame-ancestors` ma aumenta compatibilità con browser meno recenti |
| `X-Content-Type-Options: nosniff` | Impedisce MIME-sniffing (browser non re-interpreta JS come HTML) |
| `Referrer-Policy: strict-origin-when-cross-origin` | Invia il referrer solo all'origine, non il path completo; solo su HTTPS→HTTPS |
| `Permissions-Policy: geolocation=(), microphone=(), camera=()` | Disabilita esplicitamente API sensibili non usate dal sito |

---

## Modifica `vite.config.js`

Aggiungere `modulePreload: { polyfill: false }` alla sezione `build`.

**Perché:** Vite inietta di default un piccolo inline script nell'HTML per il modulePreload polyfill (browser pre-2021 che non supportano `<link rel="modulepreload">`). Questo inline script viola `script-src 'self'`. Per un portfolio fotografico i browser target supportano tutti il modulepreload nativamente, quindi il polyfill è inerte e può essere rimosso senza impatto funzionale.

```js
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
```

---

## Verifica

### Post-build locale

```bash
npm run build
grep -r "modulepreload" dist/index.html
# Expected: zero occorrenze di script inline con modulepreload polyfill
ls dist/_headers
# Expected: file presente
```

### Post-deploy (manuale, Cloudflare Pages)

Aprire DevTools → Network → cliccare su qualsiasi risposta → Headers:

| Header atteso | Valore |
|---------------|--------|
| `content-security-policy` | (stringa CSP completa) |
| `strict-transport-security` | `max-age=31536000; includeSubDomains` |
| `x-frame-options` | `DENY` |
| `x-content-type-options` | `nosniff` |
| `referrer-policy` | `strict-origin-when-cross-origin` |

Verificare che la landing, la pagina album e il form contatti funzionino normalmente (nessun errore CSP in console).

---

## Fuori scope

- Dominio custom (configurabile in Cloudflare Pages → Custom Domains)
- HSTS preload (richiede registrazione su hstspreload.org — opzionale, futuro)
- CSP nonce/hash per eventuali script inline futuri
- Nuovi provider o modifiche al frontend
