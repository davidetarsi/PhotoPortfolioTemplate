# M5 — Deploy Cloudflare Pages Design Spec

**Date:** 2026-07-07
**Milestone:** M5 (follows M4 Pages)

---

## Goal

Pubblicare il sito su Cloudflare Pages con deploy automatico ad ogni push su `main`, test come gate obbligatorio prima della build, e variabili d'ambiente configurate correttamente.

---

## Scope

M5 è interamente operativo: nessun nuovo file di codice nel repository. Tutto si configura nel dashboard Cloudflare e Google Cloud Console.

Tre step indipendenti:

- **M5.1 Push GitHub** — pubblicare i commit locali sul remote
- **M5.2 Cloudflare Pages** — creare il progetto, configurare build e variabili d'ambiente
- **M5.3 GCP referrer** — autorizzare il dominio Pages nella API key Google Drive

---

## M5.1 — Push GitHub

Il remote `origin` punta già a `https://github.com/your-github-user/your-portfolio.git`. Pubblicare tutti i commit:

```bash
git push -u origin main
```

Verificare che GitHub mostri i commit fino a `b5be091` (ultimo commit M4).

---

## M5.2 — Cloudflare Pages

### Creazione account

1. Aprire `https://cloudflare.com`
2. Cliccare **Sign Up** → inserire email e password
3. Verificare l'email (link di conferma)
4. Piano gratuito — nessuna carta di credito richiesta per Pages

### Creazione progetto Pages

1. Nel dashboard: **Workers & Pages → Create → Pages**
2. Cliccare **Connect to Git → GitHub**
3. Autorizzare Cloudflare ad accedere al repository
4. Selezionare `your-github-user/your-portfolio`

### Impostazioni build

| Campo | Valore |
|-------|--------|
| Project name | `photo-portfolio` (o nome a scelta) |
| Production branch | `main` |
| Build command | `npm test && npm run build` |
| Build output directory | `dist` |
| Root directory | *(lasciare vuoto)* |

**Nota sul build command:** `npm test` esegue `vitest run --passWithNoTests` prima della build. Se anche un solo test fallisce, Cloudflare interrompe la pipeline e non pubblica il sito. Questo protegge la produzione da regressioni introdotte da commit futuri.

### Variabili d'ambiente

Prima di salvare, aprire la sezione **Environment Variables** e aggiungere le seguenti variabili per entrambi gli ambienti (Production **e** Preview):

| Variabile | Valore | Note |
|-----------|--------|------|
| `VITE_DRIVE_API_KEY` | `<la tua chiave Google Drive>` | Stessa del file `.env` locale |
| `VITE_WEB3FORMS_ACCESS_KEY` | `<la tua chiave Web3Forms>` | Stessa del file `.env` locale |
| `NODE_VERSION` | `22` | Richiesto: il progetto richiede Node.js ≥20; il default CF è precedente |

Cliccare **Save and Deploy** → il primo deploy parte automaticamente (3-4 minuti).

### URL di produzione

Al termine del deploy, Cloudflare assegna un URL del tipo:
`https://photo-portfolio.pages.dev` (o variante con hash se il nome è già preso).

---

## M5.3 — Aggiornamento referrer API key Google Drive

Quando il sito gira su `*.pages.dev`, le chiamate all'API Google Drive partono da quel dominio. Se la chiave è vincolata solo a `localhost`, le richieste ricevono **403 Forbidden** e la griglia foto risulta vuota.

Cloudflare Pages genera inoltre URL di preview per ogni branch/PR (es. `https://<branch>.<nome>.pages.dev`). Senza il wildcard sui sottodomini, tutte le preview ricevono 403 e non è possibile testare in staging prima del merge.

### Procedura

1. Aprire **Google Cloud Console** → `console.cloud.google.com`
2. Navigare in **APIs & Services → Credentials**
3. Cliccare sulla chiave `VITE_DRIVE_API_KEY`
4. In **Application restrictions**, selezionare **HTTP referrers (web sites)**
5. In **Website restrictions**, aggiungere:
   - `http://localhost:5173/*` (sviluppo locale)
   - `https://<nome>.pages.dev/*` (produzione)
   - `https://*.<nome>.pages.dev/*` (wildcard per preview deployments di branch e PR)
6. Cliccare **Save**

Le modifiche ai referrer diventano attive in pochi minuti.

---

## M5.4 — Allowed Domains Web3Forms

La chiave `VITE_WEB3FORMS_ACCESS_KEY` è esposta lato client come la Drive key. Chiunque la estragga dal sorgente può chiamare l'endpoint Web3Forms da qualsiasi dominio, consumando le 250 submission/mese gratuite o inondando la casella di spam. Web3Forms supporta una lista di domini autorizzati per ogni access key.

### Procedura

1. Aprire `https://web3forms.com` e accedere al proprio account
2. Navigare in **Dashboard → Access Keys**
3. Cliccare sulla chiave in uso
4. In **Allowed Domains**, aggiungere:
   - `localhost` (sviluppo locale)
   - `<nome>.pages.dev` (produzione)
   - `*.<nome>.pages.dev` (preview deployments)
5. Salvare

Le submission provenienti da domini non in lista vengono rifiutate da Web3Forms.

---

## Verifica finale

Dopo aver completato M5.2, M5.3 e M5.4, verificare manualmente i tre percorsi principali:

| URL | Verifica |
|-----|---------|
| `https://<nome>.pages.dev/` | Landing con hero e card album visibili |
| `https://<nome>.pages.dev/album.html?album=<slug>` | Griglia foto caricata, lightbox funzionante |
| `https://<nome>.pages.dev/contatti.html` | Form contatti invia correttamente |

Se la griglia foto è vuota: controllare M5.3 (referrer GCP).
Se il form non invia: controllare M5.4 (allowed domains Web3Forms) e la variabile `VITE_WEB3FORMS_ACCESS_KEY` in CF dashboard.

---

## Fuori scope (M6)

- File `_headers` con Content Security Policy
- Dominio custom (configurabile in seguito da Cloudflare Pages → Custom Domains)
