# M0 — Progetto in piedi: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffoldare un progetto Vite vanilla multipagina con struttura di cartelle completa, configurazione Git e README pronto per lo sviluppo delle milestone successive.

**Architecture:** Vite vanilla (no framework) con 3 entry HTML (index, album, contatti), struttura di cartelle separata per responsabilità (`config/`, `theme/`, `src/`), con file placeholder che rispettano già i contratti delle interfacce definitive. Nessuna logica applicativa — solo scheletro.

**Tech Stack:** Node.js LTS (v20+), Vite 6.x, HTML/CSS/JS vanilla, Git, GitHub CLI o web UI

## Global Constraints

- Vanilla JS — nessun framework (React, Vue, Svelte, Angular, ecc.)
- Nessuna libreria aggiuntiva oltre Vite in questa milestone
- Node.js ≥ 20 LTS
- Struttura cartelle esatta: `config/`, `theme/`, `src/pages/`, `src/providers/`, `src/components/`, `src/styles/`, `public/`
- I file JS in `src/` usano sintassi ES module (`export`/`import`)
- Commit per ogni task (o task group): formato `M0.N: descrizione`
- Repo GitHub **privato** (per ora)

---

## File Map

| File | Azione | Responsabilità |
|------|--------|----------------|
| `index.html` | Crea/Modifica | Entry HTML landing, punta a `src/pages/index.js` |
| `album.html` | Crea | Entry HTML pagina album, punta a `src/pages/album.js` |
| `contatti.html` | Crea | Entry HTML pagina contatti, punta a `src/pages/contatti.js` |
| `vite.config.js` | Crea | Registra i 3 entry point per la build multipagina |
| `config/site.config.js` | Crea | Identità del sito (nome, bio, social, provider, form) |
| `config/albums.config.js` | Crea | Lista album (slug, titolo, descrizione, folderId, cover) |
| `config/texts.config.js` | Crea | Testi delle pagine (landing, contatti, footer) |
| `theme/tokens.css` | Crea | Design tokens: colori, font, spazi, raggi |
| `theme/typography.css` | Crea | Scala tipografica e import font |
| `src/pages/index.js` | Crea | Entry JS landing — placeholder |
| `src/pages/album.js` | Crea | Entry JS album — placeholder |
| `src/pages/contatti.js` | Crea | Entry JS contatti — placeholder |
| `src/providers/provider.js` | Crea | Contratto JSDoc dell'interfaccia provider |
| `src/providers/googleDrive.js` | Crea | Stub provider Drive (implementato in M1) |
| `src/styles/main.css` | Crea | CSS strutturale base, importa i token |
| `src/components/.gitkeep` | Crea | Tiene traccia della dir vuota in Git |
| `.gitignore` | Verifica/Modifica | Esclude node_modules, dist, .env, .DS_Store |
| `README.md` | Crea | Comandi, struttura, decisioni architetturali |

---

### Task 1: Bootstrap del progetto Vite (M0.1)

**Files:**
- Create: `package.json` (generato da Vite)
- Create: `index.html` (generato da Vite, poi sostituito)
- Create: `.gitignore` (generato da Vite)

**Interfaces:**
- Produces: `npm run dev` funzionante su http://localhost:5173 · `npm run build` funzionante · base da cui costruire i task successivi

- [ ] **Step 1: Verifica Node.js ≥ 20**

```bash
node --version
```
Expected: `v20.x.x` o `v22.x.x`.

Se non installato, installa via Homebrew:
```bash
brew install node@22
```
oppure scarica dal sito ufficiale: https://nodejs.org (scarica la versione "LTS").

- [ ] **Step 2: Crea il progetto Vite nella directory corrente**

Dalla directory `/path/to/PhotoPortfolio/`:
```bash
npm create vite@latest . -- --template vanilla
```

Il tool chiederà cosa fare con i file esistenti. Seleziona **"Ignore files and continue"** (la directory ha già i file di pianificazione — non vanno cancellati).

Expected output finale:
```
Done. Now run:
  npm install
  npm run dev
```

- [ ] **Step 3: Installa le dipendenze**

```bash
npm install
```
Expected: `added N packages` senza errori.

- [ ] **Step 4: Avvia dev server e verifica la pagina di default**

```bash
npm run dev
```
Expected nel terminale:
```
  VITE v6.x.x  ready in Xms

  ➜  Local:   http://localhost:5173/
```
Apri http://localhost:5173/. Expected: pagina Vite di default. Chiudi con Ctrl+C.

- [ ] **Step 5: Sostituisci index.html con il template pulito**

Sostituisci l'intero contenuto di `index.html` con:

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portfolio</title>
  </head>
  <body>
    <p>Landing — work in progress</p>
    <script type="module" src="/src/pages/index.js"></script>
  </body>
</html>
```

- [ ] **Step 6: Rimuovi i file default di Vite non necessari**

```bash
rm -f src/counter.js src/main.js src/style.css public/vite.svg
```
Ignora eventuali errori "no such file".

- [ ] **Step 7: Verifica che la build passi**

```bash
npm run build
```
Expected: `✓ built in Xms` senza errori. (Il warning su entry point mancante per `src/main.js` è atteso e verrà risolto al Task 3.)

---

### Task 2: Struttura di cartelle boilerplate (M0.2)

**Files:**
- Create: `config/site.config.js`
- Create: `config/albums.config.js`
- Create: `config/texts.config.js`
- Create: `theme/tokens.css`
- Create: `theme/typography.css`
- Create: `src/pages/index.js`
- Create: `src/pages/album.js`
- Create: `src/pages/contatti.js`
- Create: `src/providers/provider.js`
- Create: `src/providers/googleDrive.js`
- Create: `src/styles/main.css`
- Create: `src/components/.gitkeep`

**Interfaces:**
- Produces: struttura completa leggibile da tutti i task M1–M4 · `listPhotos(albumRef)` definito come contratto in `provider.js`

- [ ] **Step 1: Crea le directory**

```bash
mkdir -p config theme src/pages src/providers src/components src/styles
```

- [ ] **Step 2: Crea config/site.config.js**

```js
export const siteConfig = {
  name: 'Nome Fotografo',
  bio: 'Una breve descrizione del fotografo.',
  social: {
    // instagram: 'https://instagram.com/...',
  },
  provider: 'googleDrive',
  formEndpoint: '',
};
```

- [ ] **Step 3: Crea config/albums.config.js**

```js
export const albums = [
  // Esempio — da compilare in M2.1:
  // {
  //   slug: 'paesaggi',
  //   title: 'Paesaggi',
  //   description: 'Montagne e mari.',
  //   driveFolderId: 'GOOGLE_DRIVE_FOLDER_ID',
  //   cover: null,   // null = usa la prima foto della cartella
  // },
];
```

- [ ] **Step 4: Crea config/texts.config.js**

```js
export const texts = {
  landing: {
    hero: 'Benvenuto nel portfolio.',
  },
  contatti: {
    heading: 'Contatti',
    body: 'Scrivimi per informazioni.',
  },
  footer: {
    copyright: `© ${new Date().getFullYear()}`,
  },
};
```

- [ ] **Step 5: Crea theme/tokens.css**

```css
:root {
  /* Colors — valori definitivi scelti in M2.4 */
  --color-bg: #ffffff;
  --color-text: #111111;
  --color-accent: #000000;
  --color-muted: #666666;

  /* Typography */
  --font-body: sans-serif;
  --font-heading: sans-serif;

  /* Spacing scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 2rem;
  --space-xl: 4rem;

  /* Border radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
}
```

- [ ] **Step 6: Crea theme/typography.css**

```css
/* Import font da Google Fonts — da aggiungere in M2.4 dopo la scelta del tema */

body {
  font-family: var(--font-body);
  line-height: 1.6;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  line-height: 1.2;
}
```

- [ ] **Step 7: Crea src/pages/index.js**

```js
// Entry point landing page — logica implementata in M3/M4
console.log('[portfolio] index.js caricato');
```

- [ ] **Step 8: Crea src/pages/album.js**

```js
// Entry point pagina album — logica implementata in M3/M4
console.log('[portfolio] album.js caricato');
```

- [ ] **Step 9: Crea src/pages/contatti.js**

```js
// Entry point pagina contatti — logica implementata in M4
console.log('[portfolio] contatti.js caricato');
```

- [ ] **Step 10: Crea src/providers/provider.js**

```js
/**
 * Contratto del provider foto.
 *
 * Ogni provider concreto (es. googleDrive.js) deve esportare
 * una funzione `listPhotos` con questa stessa firma.
 *
 * @param {string} albumRef - Riferimento all'album (per Drive: folderId).
 * @returns {Promise<Array<{name: string, gridUrl: string, fullUrl: string}>>}
 *   Array di foto con nome file, URL thumbnail per griglia e URL ad alta risoluzione.
 * @throws {Error} Se il provider non è raggiungibile o l'album non esiste.
 */
export async function listPhotos(albumRef) {
  throw new Error('listPhotos() non implementato — usa un provider concreto (es. googleDrive.js)');
}
```

- [ ] **Step 11: Crea src/providers/googleDrive.js**

```js
// Implementazione completa in M1.3
// Contratto: vedi src/providers/provider.js

/**
 * @param {string} folderId - ID della cartella Google Drive condivisa.
 * @returns {Promise<Array<{name: string, gridUrl: string, fullUrl: string}>>}
 */
export async function listPhotos(folderId) {
  throw new Error('googleDrive.listPhotos() non ancora implementato — vedi M1.3');
}
```

- [ ] **Step 12: Crea src/styles/main.css**

```css
@import '../../theme/tokens.css';
@import '../../theme/typography.css';

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--color-bg);
  color: var(--color-text);
}
```

- [ ] **Step 13: Crea il placeholder per src/components/**

```bash
touch src/components/.gitkeep
```

- [ ] **Step 14: Verifica che npm run build passi**

```bash
npm run build
```
Expected: `✓ built in Xms` senza errori di sintassi. Eventuali warning su entry point sono attesi finché non configuriamo Vite multipagina al Task 3.

---

### Task 3: Configurazione Vite multipagina (M0.3)

**Files:**
- Create: `vite.config.js`
- Create: `album.html`
- Create: `contatti.html`

**Interfaces:**
- Produces: le 3 pagine si aprono in dev (`/`, `/album.html`, `/contatti.html`) e compaiono in `dist/` dopo la build

- [ ] **Step 1: Crea vite.config.js**

```js
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
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

- [ ] **Step 2: Crea album.html**

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Album — Portfolio</title>
  </head>
  <body>
    <p>Pagina album — work in progress</p>
    <script type="module" src="/src/pages/album.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Crea contatti.html**

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Contatti — Portfolio</title>
  </head>
  <body>
    <p>Contatti — work in progress</p>
    <script type="module" src="/src/pages/contatti.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Verifica le 3 pagine in dev**

```bash
npm run dev
```
Apri nel browser (una alla volta):
- http://localhost:5173/ → Expected: "Landing — work in progress"
- http://localhost:5173/album.html → Expected: "Pagina album — work in progress"
- http://localhost:5173/contatti.html → Expected: "Contatti — work in progress"

Apri la console del browser (F12 → Console): expected nessun errore rosso; devono comparire i log `[portfolio] index.js caricato`, ecc.

Chiudi con Ctrl+C.

- [ ] **Step 5: Verifica build multipagina**

```bash
npm run build && ls dist/
```
Expected in `dist/`:
```
assets/
index.html
album.html
contatti.html
```
Tutti e 3 i file HTML devono essere presenti.

---

### Task 4: Init Git + repository GitHub (M0.4)

**Files:**
- Modify: `.gitignore` (verifica e integra se necessario)

**Interfaces:**
- Produces: repo Git locale con storico pulito · remote GitHub privato configurato · primo push completato

- [ ] **Step 1: Inizializza Git**

```bash
git init
git branch -m main
```
Expected: `Initialized empty Git repository in .../PhotoPortfolio/.git/`

- [ ] **Step 2: Verifica e integra .gitignore**

Apri `.gitignore`. Assicurati che contenga almeno:
```
node_modules
dist
.env
.env.local
.env.*.local
.DS_Store
```
Aggiungi le righe mancanti se necessario.

- [ ] **Step 3: Aggiungi tutti i file al primo commit**

```bash
git add index.html album.html contatti.html vite.config.js package.json package-lock.json .gitignore config/ theme/ src/ public/ docs/ piano-implementazione.md roadmap-sito-portfolio.md mockups/
git status
```
Verifica che `node_modules/` e `dist/` **non** compaiano nella lista. Se compaiono, interrompi e controlla `.gitignore`.

```bash
git commit -m "M0.1-M0.3: bootstrap Vite multipagina + struttura boilerplate"
```

- [ ] **Step 4: Crea repo GitHub privato**

1. Vai su https://github.com/new
2. Repository name: `photo-portfolio` (o nome preferito)
3. Visibilità: **Private**
4. **Non** spuntare "Add a README file" (lo abbiamo già)
5. Click "Create repository"

- [ ] **Step 5: Collega il repo remoto e fai il primo push**

Copia il comando dalla pagina GitHub ("push an existing repository from the command line") e sostituisci `TUO-USERNAME`:

```bash
git remote add origin https://github.com/TUO-USERNAME/photo-portfolio.git
git push -u origin main
```
Expected: `Branch 'main' set up to track remote branch 'main' from 'origin'.`

Verifica andando su `https://github.com/TUO-USERNAME/photo-portfolio` — deve apparire la lista file.

---

### Task 5: README iniziale (M0.5)

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: README che permette a un altro dev di avviare il progetto senza leggere altri file

- [ ] **Step 1: Crea README.md**

```markdown
# Photo Portfolio

Sito portfolio fotografico statico multipagina. Le foto sono lette da cartelle Google Drive condivise via Drive API v3 — nessun backend, nessun database.

## Avvio rapido

```bash
node --version   # richiede v20+
npm install
npm run dev      # → http://localhost:5173/
npm run build    # output in dist/
```

## Struttura

```
config/          ← contenuti: identità, album, testi
theme/           ← aspetto: design tokens, tipografia
src/pages/       ← entry point JS per ciascuna pagina
src/providers/   ← layer dati (Google Drive + futuri provider)
src/components/  ← componenti UI riusabili
src/styles/      ← CSS strutturale (consuma solo i token)
public/          ← asset statici (favicon, cover locali)
```

## Personalizzare

| Cosa cambiare | Dove |
|---|---|
| Nome, bio, social | `config/site.config.js` |
| Aggiungere/rimuovere un album | `config/albums.config.js` |
| Testi delle pagine | `config/texts.config.js` |
| Colori e font | `theme/tokens.css` |
| Tipografia dettagliata | `theme/typography.css` |

## Decisioni architetturali

- **Storage**: Google Drive (cartelle "chiunque con il link") — non Google Foto (Library API ristretta da marzo 2025).
- **Bundler**: Vite multipagina — entry point registrati in `vite.config.js → rollupOptions.input`.
- **Framework**: nessuno — vanilla JS/HTML/CSS.
- **Provider**: interfaccia astratta in `src/providers/provider.js`; l'implementazione Drive in `src/providers/googleDrive.js` è sostituibile senza modificare le pagine.
- **Deploy target**: Cloudflare Pages (CDN, build automatica, dominio gratuito).

## Roadmap

Vedi [`roadmap-sito-portfolio.md`](roadmap-sito-portfolio.md) per la visione d'insieme e [`piano-implementazione.md`](piano-implementazione.md) per i task dettagliati.
```

- [ ] **Step 2: Commit e push del README**

```bash
git add README.md
git commit -m "M0.5: README iniziale con comandi, struttura e decisioni"
git push
```

---

## Self-Review

### 1. Spec coverage

| Requisito (piano-implementazione.md) | Task che lo implementa |
|---|---|
| M0.1: Node.js LTS + Vite vanilla, `npm run dev` funzionante | Task 1, Step 1–4 |
| M0.2: struttura cartelle + file segnaposto, `npm run build` passa | Task 2 |
| M0.3: Vite multipagina, 3 pagine in dev e in `dist/` | Task 3 |
| M0.4: Git + repo GitHub privato + .gitignore + primo push | Task 4 |
| M0.5: README con comandi, struttura, decisioni | Task 5 |

Tutti i requisiti di M0 sono coperti. ✓

### 2. Placeholder scan

- I commenti `// Entry point ... — logica implementata in M3/M4` nei file JS sono segnaposto intenzionali per una milestone di scaffolding: descrivono quando sarà implementato, non "cosa", e non sono richieste di implementazione futura generiche. ✓
- I `throw new Error(...)` nei provider sono stubs espliciti, non "TODO" vaghi. ✓
- Nessun passo dice "aggiungi gestione errori appropriata" o "scrivi i test" senza mostrare il codice. ✓

### 3. Type consistency

`src/providers/provider.js` e `src/providers/googleDrive.js` esportano entrambi `listPhotos(albumRef/folderId)` che restituisce `Promise<Array<{name, gridUrl, fullUrl}>>`. I task M1 faranno riferimento a questa stessa firma. ✓
