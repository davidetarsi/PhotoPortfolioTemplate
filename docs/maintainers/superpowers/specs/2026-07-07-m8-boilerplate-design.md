# M8 — Boilerplate/Template Repo Design Spec

**Date:** 2026-07-07
**Milestone:** M8

---

## Goal

Trasformare il repo in un boilerplate riutilizzabile: config ripulita da dati reali, README riscritto come guida di setup con checklist numerata, CUSTOMIZING.md come guida per tipo di modifica. Per ogni nuovo portfolio cloni il repo, segui la checklist, e sei online.

---

## Scope

| Azione | File |
|--------|------|
| Modifica | `config/site.config.js` |
| Modifica | `config/albums.config.js` |
| Riscrittura | `README.md` |
| Crea | `CUSTOMIZING.md` |

Nessuna modifica a `src/`, `theme/`, `public/`, HTML delle pagine o test.

**Fuori scope:** GitHub Template Repository è un setting dashboard GitHub (Settings → "Template repository") — va menzionato in README ma non richiede codice.

---

## Reset config a valori template

### `config/site.config.js`

`heroImageUrl` era un URL reale — va resettato a stringa vuota. Il resto è già placeholder.

```js
export const siteConfig = {
  name: 'Nome Fotografo',
  bio: 'Una breve descrizione del fotografo.',
  language: 'it',
  heroImageUrl: '',
  social: {
    // instagram: 'https://instagram.com/...',
  },
  provider: 'googleDrive',
  driveApiKey: import.meta.env.VITE_DRIVE_API_KEY,
  web3formsAccessKey: import.meta.env.VITE_WEB3FORMS_ACCESS_KEY ?? '',
};
```

### `config/albums.config.js`

`driveFolderId` e `cover` erano dati reali — vanno resettati a placeholder espliciti.

```js
export const albums = [
  {
    slug: 'nome-album',
    title: 'Titolo Album',
    description: 'Descrizione breve dell\'album.',
    driveFolderId: 'YOUR_DRIVE_FOLDER_ID',
    cover: '',
  },
];
```

---

## `README.md`

Riscrittura completa. Struttura:

### 1. Header
```
# Photo Portfolio — Boilerplate

Sito portfolio fotografico statico multipagina. Le foto vengono lette
da cartelle Google Drive condivise via Drive API v3 — nessun backend, nessun database.
Personalizza config/ e theme/, poi deploya su Cloudflare Pages.
```

### 2. Quick start
```bash
node --version   # richiede v20+
npm install
npm run dev      # → http://localhost:5173/
npm run build    # output in dist/
npm test         # 86 test
```

### 3. Setup checklist — per ogni nuovo portfolio

Passi numerati in ordine operativo:

1. **Crea la cartella Google Drive** — condividi con "chiunque con il link può visualizzare"
2. **Google Cloud Console** → abilita Drive API v3 → crea API key → imposta restrizione HTTP referrer con tre voci: `http://localhost:5173/*` (sviluppo locale), `https://nome.pages.dev/*` (produzione), `https://*.nome.pages.dev/*` (preview deployments)
3. **Web3Forms** → crea account su web3forms.com → copia l'access key → in Dashboard → Access Keys aggiungi in "Allowed Domains": `localhost` (sviluppo locale) e il dominio Cloudflare Pages (produzione + preview)
4. **Variabili d'ambiente locali** → `cp .env.example .env` → compila `VITE_DRIVE_API_KEY` e `VITE_WEB3FORMS_ACCESS_KEY`
5. **Identità del fotografo** → `config/site.config.js` → compila `name`, `bio`, `heroImageUrl`, `social`
6. **Album** → `config/albums.config.js` → per ogni album: `driveFolderId` (ID cartella Drive), `cover` (URL immagine di copertina da Drive), `slug`, `title`, `description`
7. *(Opzionale)* **Testi UI** → `config/texts.config.js` → subtitle landing, testi form contatti, messaggi di errore
8. *(Opzionale)* **Tema visivo** → `theme/tokens.css` per colori e variabili font → `theme/typography.css` per scala tipografica → aggiorna i `<link>` Google Fonts in `index.html`, `album.html`, `contatti.html` se cambi font
9. **Deploy Cloudflare Pages** → nuovo progetto → collega GitHub → build command: `npm test && npm run build` → output: `dist` → aggiungi env vars `VITE_DRIVE_API_KEY` e `VITE_WEB3FORMS_ACCESS_KEY` (produzione **e** preview) → `NODE_VERSION=22`

### 4. Mappa dei file

| Cosa cambiare | File |
|---|---|
| Nome, bio, hero image, social | `config/site.config.js` |
| Aggiungere/rimuovere un album | `config/albums.config.js` |
| Testi UI (form, messaggi errore) | `config/texts.config.js` |
| Colori, spaziature, variabili font | `theme/tokens.css` |
| Scala tipografica e font Google | `theme/typography.css` + `<link>` nei tre HTML |

### 5. Struttura progetto

```
config/          ← contenuti: identità, album, testi
theme/           ← aspetto: design tokens, tipografia
src/pages/       ← entry point JS per ciascuna pagina
src/providers/   ← layer dati (Google Drive + futuri provider)
src/components/  ← componenti UI riusabili
src/styles/      ← CSS strutturale (consuma solo i token)
public/          ← asset statici (favicon, _headers CF)
scripts/         ← strumenti di sviluppo (compress.js)
```

### 6. Architettura

- **Storage:** Google Drive (non Google Foto — Library API ristretta da marzo 2025)
- **Bundler:** Vite 8.x multipagina — entry point in `vite.config.js → rollupOptions.input`
- **Framework:** nessuno — vanilla JS/HTML/CSS
- **Provider:** interfaccia astratta in `src/providers/provider.js`; `googleDrive.js` è sostituibile senza modificare le pagine
- **Deploy:** Cloudflare Pages — CDN, build automatica, dominio gratuito `*.pages.dev`
- **Compressione foto:** `npm run compress -- --input <percorso>` (Sharp, WebP 1900px q85)

### 7. GitHub Template

Per usare questo repo come template: GitHub → Settings → spunta "Template repository". Per ogni nuovo portfolio: "Use this template" → nuovo repo privato.

---

## `CUSTOMIZING.md`

Guida per tipo di modifica, con percorsi esatti e valori di esempio.

### Sezioni

**Identità del fotografo (`config/site.config.js`)**
- `name` — nome visualizzato in nav e footer
- `bio` — testo nella sezione hero della landing
- `heroImageUrl` — URL immagine hero (formato `https://lh3.googleusercontent.com/d/FILE_ID`)
- `social.instagram` (e altri) — link social, commentati di default
- `driveApiKey` / `web3formsAccessKey` — da `.env`, non modificare qui

**Album (`config/albums.config.js`)**
- `slug` — identificatore URL (`album.html?album=<slug>`) — solo lettere minuscole e trattini
- `title` / `description` — testo visualizzato nella card
- `driveFolderId` — ID cartella Google Drive (dalla URL: `drive.google.com/drive/folders/<ID>`)
- `cover` — URL immagine di copertina (formato `https://lh3.googleusercontent.com/d/FILE_ID`)
- Per aggiungere un album: aggiungere un oggetto all'array. Per rimuoverlo: eliminare l'oggetto.

> **Il concetto "album" si adatta al dominio.** La struttura è la stessa — una cartella Drive con una copertina — ma il significato dipende dal contesto:
> - Fotografo: `{ slug: 'matrimoni', title: 'Matrimoni', ... }`
> - Casa vacanze a Roma: `{ slug: 'camere', title: 'Le nostre camere', ... }`, `{ slug: 'salone', title: 'Spazi comuni', ... }`, `{ slug: 'esterni', title: 'Esterni e terrazza', ... }`
> - Artista visivo: `{ slug: 'acquerelli-2024', title: 'Acquerelli 2024', ... }`
>
> Il frontend non sa nulla del dominio — mostra titolo, descrizione e foto. Solo `config/albums.config.js` cambia.

**Testi UI (`config/texts.config.js`)**
- `landing.heroSubtitle` — sottotitolo sotto il nome nella landing
- `contatti.heading` / `contatti.body` — titolo e testo della pagina contatti
- `contatti.form.*` — label e messaggi del form di contatto
- I messaggi di errore Drive (`album.error.*`) sono tecnici — modificarli solo se necessario

**Colori e spaziature (`theme/tokens.css`)**
- `--color-bg` / `--color-text` / `--color-accent` / `--color-muted` / `--color-surface` — palette
- `--font-body` / `--font-heading` / `--font-mono` — nomi font (devono corrispondere ai Google Fonts caricati)
- `--space-*` — scala spaziature (xs/sm/md/lg/xl)

**Font (`theme/typography.css` + HTML)**
- Cambiare font richiede tre passi: 1) aggiornare `--font-body`/`--font-heading` in `tokens.css`, 2) aggiornare il tag `<link>` Google Fonts in **tutti e tre** gli HTML (`index.html`, `album.html`, `contatti.html`), 3) aggiornare `theme/typography.css` se si vuole cambiare i pesi

**Compressione foto prima dell'upload**
```bash
npm run compress -- --input /percorso/cartella
# Legge da:  /percorso/cartella/originali/
# Scrive in: /percorso/cartella/optimized/   ← questa si carica su Drive
```

**Deploy su Cloudflare Pages**
- Build command: `npm test && npm run build`
- Build output: `dist`
- Env vars (produzione + preview): `VITE_DRIVE_API_KEY`, `VITE_WEB3FORMS_ACCESS_KEY`, `NODE_VERSION=22`
- Dopo il primo deploy: verificare che `localhost` e il dominio `*.pages.dev` siano già presenti in Allowed Domains su Web3Forms e nella restrizione referrer dell'API key GCP (configurati al punto 2 e 3)

---

## Verifica

```bash
npm test
# Expected: 86 test passati — il reset dei config non rompe nulla
# (i test mockano le API, non usano dati reali)

npm run build
# Expected: build completata, dist/ generata
```
