# M8 — Boilerplate/Template Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare il repo in un boilerplate riutilizzabile: config ripulita da dati reali, README riscritto come guida di setup numerata, CUSTOMIZING.md come guida per tipo di modifica.

**Architecture:** Solo modifiche a file di configurazione e documentazione — nessuna modifica a `src/`, `theme/`, `public/`, o test. I config file vengono resettati a valori placeholder espliciti. README e CUSTOMIZING.md vengono scritti con contenuto verbatim dalla spec.

**Tech Stack:** Markdown, JS ESM config files.

## Global Constraints

- `config/site.config.js`: `heroImageUrl` deve essere `''` (stringa vuota)
- `config/albums.config.js`: `driveFolderId` deve essere `'YOUR_DRIVE_FOLDER_ID'`, `cover` deve essere `''`
- I test esistenti (86, 13 file) devono continuare a passare dopo ogni task — i test mockano le API, non usano dati reali
- Nessuna modifica a file fuori da `config/`, `README.md`, `CUSTOMIZING.md`

---

### Task 1: Reset config a valori template

**Files:**
- Modifica: `config/site.config.js`
- Modifica: `config/albums.config.js`

---

- [ ] **Step 1: Modifica `config/site.config.js`**

Aprire `config/site.config.js` e sostituire il file con il seguente contenuto (solo `heroImageUrl` cambia — da URL reale a stringa vuota):

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

- [ ] **Step 2: Modifica `config/albums.config.js`**

Aprire `config/albums.config.js` e sostituire il file con il seguente contenuto (`driveFolderId` e `cover` resettati a placeholder, `slug` e `title` aggiornati a valori generici):

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

- [ ] **Step 3: Verifica che i test passino**

```bash
npm test
```

Expected:
```
Test Files  13 passed (13)
     Tests  86 passed (86)
```

I test mockano le API Drive — non usano `driveFolderId` o `heroImageUrl` reali, quindi il reset non deve causare regressioni.

- [ ] **Step 4: Commit**

```bash
git add config/site.config.js config/albums.config.js
git commit -m "chore: reset config to boilerplate placeholder values"
```

---

### Task 2: Riscrittura README.md

**Files:**
- Modifica: `README.md`

---

- [ ] **Step 1: Riscrivi `README.md`**

Sostituire l'intero contenuto di `README.md` con il seguente:

```markdown
# Photo Portfolio — Boilerplate

Sito portfolio fotografico statico multipagina. Le foto vengono lette da cartelle Google Drive condivise via Drive API v3 — nessun backend, nessun database. Personalizza `config/` e `theme/`, poi deploya su Cloudflare Pages.

## Quick start

​```bash
node --version   # richiede v20+
npm install
npm run dev      # → http://localhost:5173/
npm run build    # output in dist/
npm test         # 86 test
​```

## Setup checklist — per ogni nuovo portfolio

1. **Crea la cartella Google Drive** — condividi con "chiunque con il link può visualizzare"
2. **Google Cloud Console** → abilita Drive API v3 → crea API key → imposta restrizione HTTP referrer con tre voci:
   - `http://localhost:5173/*` (sviluppo locale)
   - `https://nome.pages.dev/*` (produzione — sostituisci `nome` con il nome del tuo progetto CF)
   - `https://*.nome.pages.dev/*` (preview deployments)
3. **Web3Forms** → crea account su web3forms.com → copia l'access key → in Dashboard → Access Keys aggiungi in "Allowed Domains": `localhost` (sviluppo locale) e il dominio Cloudflare Pages (es. `nome.pages.dev`)
4. **Variabili d'ambiente locali** → `cp .env.example .env` → compila `VITE_DRIVE_API_KEY` e `VITE_WEB3FORMS_ACCESS_KEY`
5. **Identità** → `config/site.config.js` → compila `name`, `bio`, `heroImageUrl`, `social`
6. **Album** → `config/albums.config.js` → per ogni album: `driveFolderId` (ID cartella Drive), `cover` (URL copertina), `slug`, `title`, `description`
7. *(Opzionale)* **Testi UI** → `config/texts.config.js` → subtitle landing, testi form, messaggi errore
8. *(Opzionale)* **Tema visivo** → `theme/tokens.css` per colori e variabili font → `theme/typography.css` per scala tipografica → aggiorna i `<link>` Google Fonts in `index.html`, `album.html`, `contatti.html` se cambi font
9. **Deploy Cloudflare Pages** → nuovo progetto → collega il repo GitHub → imposta:
   - Build command: `npm test && npm run build`
   - Build output directory: `dist`
   - Env vars (produzione **e** preview): `VITE_DRIVE_API_KEY`, `VITE_WEB3FORMS_ACCESS_KEY`, `NODE_VERSION=22`
   - Verifica che `localhost` e `*.pages.dev` siano già presenti nelle whitelist GCP e Web3Forms configurate ai punti 2 e 3

## Mappa dei file

| Cosa cambiare | File |
|---|---|
| Nome, bio, hero image, social | `config/site.config.js` |
| Aggiungere/rimuovere un album | `config/albums.config.js` |
| Testi UI (form, messaggi errore) | `config/texts.config.js` |
| Colori, spaziature, variabili font | `theme/tokens.css` |
| Scala tipografica e font Google | `theme/typography.css` + `<link>` nei tre HTML |

## Struttura progetto

​```
config/          ← contenuti: identità, album, testi
theme/           ← aspetto: design tokens, tipografia
src/pages/       ← entry point JS per ciascuna pagina
src/providers/   ← layer dati (Google Drive + futuri provider)
src/components/  ← componenti UI riusabili
src/styles/      ← CSS strutturale (consuma solo i token)
public/          ← asset statici (favicon, _headers CF)
scripts/         ← strumenti di sviluppo (compress.js)
​```

## Architettura

- **Storage:** Google Drive (non Google Foto — Library API ristretta da marzo 2025)
- **Bundler:** Vite 8.x multipagina — entry point in `vite.config.js → rollupOptions.input`
- **Framework:** nessuno — vanilla JS/HTML/CSS
- **Provider:** interfaccia astratta in `src/providers/provider.js`; `googleDrive.js` è sostituibile senza modificare le pagine
- **Deploy:** Cloudflare Pages — CDN, build automatica, dominio gratuito `*.pages.dev`
- **Compressione foto:** `npm run compress -- --input <percorso>` (Sharp, WebP 1900px q85)

## GitHub Template

Per usare questo repo come template: GitHub → Settings → spunta "Template repository". Per ogni nuovo portfolio: "Use this template" → nuovo repo privato.
```

- [ ] **Step 2: Verifica sezioni presenti**

```bash
grep -c "^## " README.md
```

Expected: `6` (Quick start, Setup checklist, Mappa dei file, Struttura progetto, Architettura, GitHub Template)

```bash
grep "localhost" README.md
```

Expected: almeno due righe (step 2 e step 3 della checklist)

- [ ] **Step 3: Verifica che i test passino**

```bash
npm test
```

Expected: `Test Files 13 passed (13), Tests 86 passed (86)`

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README as boilerplate setup guide"
```

---

### Task 3: Creazione CUSTOMIZING.md

**Files:**
- Crea: `CUSTOMIZING.md`

---

- [ ] **Step 1: Crea `CUSTOMIZING.md`**

Creare il file `CUSTOMIZING.md` alla root del progetto con il seguente contenuto:

```markdown
# Guida alla personalizzazione

Questo boilerplate è progettato per essere riutilizzato su contesti diversi: portfolio fotografici, siti per strutture ricettive, gallerie d'artista. Qui trovi le istruzioni per ogni tipo di modifica.

---

## Identità (`config/site.config.js`)

| Campo | Descrizione | Esempio |
|---|---|---|
| `name` | Nome visualizzato in nav e footer | `'Mario Rossi Fotografia'` |
| `bio` | Testo nella sezione hero della landing | `'Fotografo di matrimoni a Milano.'` |
| `heroImageUrl` | Immagine hero — usa il formato Drive diretto | `'https://lh3.googleusercontent.com/d/FILE_ID'` |
| `social.instagram` | Link Instagram (rimuovere il commento per attivarlo) | `'https://instagram.com/mariorossi'` |
| `language` | Lingua del sito (usata per `<html lang="">`) | `'it'` |

`driveApiKey` e `web3formsAccessKey` vengono letti da `.env` — non modificarli qui.

---

## Album (`config/albums.config.js`)

Ogni elemento dell'array `albums` corrisponde a una voce nella landing e a una pagina album accessibile via `album.html?album=<slug>`.

| Campo | Descrizione | Esempio |
|---|---|---|
| `slug` | Identificatore URL — solo lettere minuscole e trattini | `'matrimoni-2024'` |
| `title` | Titolo della card e della pagina album | `'Matrimoni 2024'` |
| `description` | Testo sotto il titolo nella card | `'Reportage emozionali.'` |
| `driveFolderId` | ID cartella Google Drive — dalla URL `drive.google.com/drive/folders/<ID>` | `'1AbCdEfGhIjKlMnOpQrStUv'` |
| `cover` | URL immagine di copertina — usa il formato Drive diretto | `'https://lh3.googleusercontent.com/d/FILE_ID'` |

Per **aggiungere** un album: aggiungere un oggetto all'array `albums`.
Per **rimuovere** un album: eliminare l'oggetto dall'array.
Per **riordinare** gli album: riordinare gli oggetti nell'array.

> **Il concetto "album" si adatta al dominio.** La struttura è la stessa — una cartella Drive con una copertina — ma il significato dipende dal contesto:
> - Fotografo: `{ slug: 'matrimoni', title: 'Matrimoni', ... }`
> - Casa vacanze a Roma: `{ slug: 'camere', title: 'Le nostre camere', ... }`, `{ slug: 'salone', title: 'Spazi comuni', ... }`, `{ slug: 'esterni', title: 'Esterni e terrazza', ... }`
> - Artista visivo: `{ slug: 'acquerelli-2024', title: 'Acquerelli 2024', ... }`
>
> Il frontend non sa nulla del dominio — mostra titolo, descrizione e foto. Solo `config/albums.config.js` cambia.

---

## Testi UI (`config/texts.config.js`)

| Campo | Descrizione |
|---|---|
| `landing.heroSubtitle` | Sottotitolo sotto il nome nella landing |
| `landing.albumsSectionHeading` | Titolo della sezione album nella landing |
| `contatti.heading` | Titolo della pagina contatti |
| `contatti.body` | Testo descrittivo sopra il form |
| `contatti.form.namePlaceholder` | Placeholder campo nome |
| `contatti.form.emailPlaceholder` | Placeholder campo email |
| `contatti.form.messagePlaceholder` | Placeholder campo messaggio |
| `contatti.form.submitLabel` | Testo del bottone di invio |
| `contatti.form.successMessage` | Messaggio mostrato dopo invio riuscito |
| `contatti.form.errorMessage` | Messaggio mostrato in caso di errore |
| `nav.homeLabel` | Etichetta link home in navigazione |
| `nav.contattiLabel` | Etichetta link contatti in navigazione |
| `footer.copyright` | Testo copyright nel footer (anno calcolato automaticamente) |

I messaggi di errore Drive (`album.error.*`) sono tecnici — modificarli solo se vuoi testi personalizzati per cartella non pubblica, errori di rete, ecc.

---

## Colori e spaziature (`theme/tokens.css`)

Tutti i valori CSS sono custom properties — cambiarli qui si propaga automaticamente a tutto il sito.

| Token | Descrizione |
|---|---|
| `--color-bg` | Sfondo principale |
| `--color-text` | Testo principale |
| `--color-accent` | Colore accento (link, bordi attivi) |
| `--color-muted` | Testo secondario / sottotitoli |
| `--color-surface` | Sfondo card e superfici rialzate |
| `--font-body` | Nome font per il body (deve corrispondere a quello caricato) |
| `--font-heading` | Nome font per i titoli |
| `--font-mono` | Nome font monospazio |
| `--space-xs/sm/md/lg/xl` | Scala spaziature (0.25 / 0.5 / 1 / 2 / 4 rem) |

---

## Font (`theme/typography.css` + HTML)

Cambiare font richiede **tre passi** — dimenticarne uno causa font fallback silenzioso:

1. In `theme/tokens.css`: aggiorna `--font-body` e/o `--font-heading` con il nome del nuovo font
2. In **tutti e tre** gli HTML (`index.html`, `album.html`, `contatti.html`): sostituisci il tag `<link>` Google Fonts con l'URL del nuovo font
3. In `theme/typography.css`: aggiorna i `font-weight` se il nuovo font ha pesi diversi

Font attuale (tema Cinematic): **Fraunces** (heading) + **Sora** (body, weight 300) + **IBM Plex Mono** (mono).

---

## Compressione foto

Prima di caricare le foto su Google Drive, usa lo script di compressione locale per ridurre il peso e convertire in WebP:

```bash
# Struttura attesa:
# /percorso/cartella/originali/   ← foto originali (JPEG, PNG, HEIC, TIFF, WebP)
# /percorso/cartella/optimized/   ← generato dallo script → da caricare su Drive

npm run compress -- --input /percorso/cartella
```

Lo script genera WebP a 1900px (lato lungo) con qualità 85. La cartella `optimized/` viene svuotata e rigenerata ad ogni run. Caricare su Drive solo `optimized/`.

---

## Deploy su Cloudflare Pages

### Primo deploy

1. GitHub → nuovo repo privato da questo template
2. Cloudflare Pages → Workers & Pages → Create → Pages → Connect to Git
3. Seleziona il repo, imposta:
   - Build command: `npm test && npm run build`
   - Build output directory: `dist`
4. Environment Variables (produzione **e** preview):
   - `VITE_DRIVE_API_KEY` = la tua API key Google Drive
   - `VITE_WEB3FORMS_ACCESS_KEY` = la tua access key Web3Forms
   - `NODE_VERSION` = `22`
5. Save and Deploy

### Whitelist domini (obbligatorio)

**Google Cloud Console** → APIs & Services → Credentials → la tua API key → HTTP referrers:
- `http://localhost:5173/*`
- `https://nome.pages.dev/*`
- `https://*.nome.pages.dev/*`

**Web3Forms** → Dashboard → Access Keys → Allowed Domains:
- `localhost`
- `nome.pages.dev`

Senza queste whitelist: 403 in locale e form non funzionante in produzione.
```

- [ ] **Step 2: Verifica sezioni presenti**

```bash
grep "^## " CUSTOMIZING.md
```

Expected (7 sezioni):
```
## Identità (`config/site.config.js`)
## Album (`config/albums.config.js`)
## Testi UI (`config/texts.config.js`)
## Colori e spaziature (`theme/tokens.css`)
## Font (`theme/typography.css` + HTML)
## Compressione foto
## Deploy su Cloudflare Pages
```

```bash
grep "localhost" CUSTOMIZING.md
```

Expected: almeno due righe (nella sezione Deploy).

- [ ] **Step 3: Verifica che i test passino**

```bash
npm test
```

Expected: `Test Files 13 passed (13), Tests 86 passed (86)`

- [ ] **Step 4: Commit**

```bash
git add CUSTOMIZING.md
git commit -m "docs: add CUSTOMIZING.md with per-type modification guide"
```

---

## Verifica finale

```bash
npm test && npm run build
# Expected: 86 test passati, build completata in dist/

ls dist/_headers dist/index.html dist/album.html dist/contatti.html
# Expected: tutti i file presenti

cat README.md | grep -c "localhost"
# Expected: ≥ 2

cat CUSTOMIZING.md | grep -c "localhost"
# Expected: ≥ 2

cat config/site.config.js | grep "heroImageUrl"
# Expected: heroImageUrl: '',

cat config/albums.config.js | grep "driveFolderId"
# Expected: driveFolderId: 'YOUR_DRIVE_FOLDER_ID',
```
