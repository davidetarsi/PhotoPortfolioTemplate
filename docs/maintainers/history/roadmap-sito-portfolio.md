# Roadmap — Sito Portfolio Fotografico (v2)

Obiettivo: un sito statico multipagina, gratuito e sicuro, che mostra le foto leggendole direttamente da cartelle Google Drive condivise, senza database né storage proprio. Personalizzazione centralizzata secondo il principio di *separation of concerns*: contenuti, tema e codice in punti distinti e ben definiti. Il progetto è un boilerplate riutilizzabile: **le personalizzazioni per gli amici le fai tu** — quindi la configurazione può essere organizzata come uno sviluppatore si aspetta, non come un non-tecnico.

## Nota preliminare: Google Foto vs Google Drive

Da marzo 2025 Google ha ristretto la Library API di Google Foto: le app di terze parti non possono più leggere automaticamente gli album dell'utente, ma solo foto selezionate manualmente tramite il "Picker". Questo rompe il requisito chiave ("modifico l'album e il sito si aggiorna da solo").

**Google Drive invece funziona perfettamente**: una cartella condivisa "chiunque con il link" può essere letta dalla Drive API v3 con una semplice API key, senza login e senza backend. Aggiungi/rimuovi foto nella cartella → il sito si aggiorna al prossimo caricamento della pagina.

→ Decisione: **Google Drive come "storage"**, con un layer provider astratto per poter aggiungere altre sorgenti in futuro.

## Struttura del sito (pagine)

1. **Landing page** (`index.html`) — presentazione + griglia di anteprime degli album (cover, titolo, descrizione), definiti in configurazione.
2. **Pagina album** (`album.html?album=slug`) — una sola pagina "modello" che riceve lo slug dell'album dalla URL, lo cerca in configurazione e carica le foto della relativa cartella Drive. Una pagina fisica, N album: niente duplicazione, aggiungere un album = aggiungere una voce in config.
3. **Contatti** (`contatti.html`) — bio breve, riferimenti e form di contatto (vedi Fase 5 per il form senza backend).

---

## Fase 0 — Fondamenta (1–2 settimane, in parallelo)

- Basi di HTML, CSS (Flexbox, Grid, custom properties) e JavaScript nel browser (fetch, DOM, URLSearchParams). Con il tuo background Flutter molti concetti saranno familiari.
- Concetti chiave: sito statico vs backend, CORS, cosa può stare nel codice client (tutto ciò che è nel JS è pubblico).
- Strumenti: Node.js + npm, Vite come dev server/bundler (supporta nativamente le build multipagina).

## Fase 1 — Setup progetto e architettura del boilerplate (1–2 giorni)

Struttura organizzata per responsabilità, come faresti in un progetto mobile:

```
portfolio/
├── index.html                ← landing
├── album.html                ← pagina modello per tutti gli album
├── contatti.html
├── config/                   ← COSA mostra il sito (contenuti)
│   ├── site.config.js        ← identità: nome, bio, social, lingua, provider
│   ├── albums.config.js      ← lista album: { slug, titolo, descrizione, driveFolderId, cover }
│   └── texts.config.js       ← testi delle pagine (landing, contatti, footer)
├── theme/                    ← COME appare il sito (aspetto)
│   ├── tokens.css            ← design tokens: colori, font, spaziature, raggi (solo --variabili)
│   └── typography.css        ← scala tipografica e import font
├── src/                      ← COME funziona il sito (logica — non si tocca per personalizzare)
│   ├── pages/                ← entry point JS di ciascuna pagina
│   ├── providers/
│   │   ├── provider.js       ← interfaccia astratta: listPhotos(albumRef)
│   │   └── googleDrive.js
│   ├── components/           ← galleria, lightbox, header, footer, card album
│   └── styles/               ← CSS strutturale/layout, che consuma solo i tokens
├── public/                   ← favicon, immagini statiche (es. cover locali)
├── README.md
└── .github/workflows/        ← (fase 8) deploy automatico
```

Principi ingegneristici applicati:
- **Separation of concerns**: `config/` = contenuti, `theme/` = aspetto, `src/` = comportamento. Personalizzare un sito per un amico significa toccare solo `config/` e `theme/` — più di due file, ma ogni file ha una responsabilità sola e chiara.
- **Single source of truth**: gli album esistono solo in `albums.config.js`; landing, pagine album e navigazione si generano da lì.
- **Open/closed sul provider**: nuove sorgenti foto si aggiungono implementando `provider.js`, senza modificare le pagine.
- Inizializza il repo Git da subito; convenzioni di commit fin dall'inizio, ti serviranno per gestire i fork degli amici.

## Fase 2 — Proof of concept: leggere le foto da Drive (2–4 giorni)

✅ *Già avviata: `galleria-drive-poc.html` (file singolo con demo mode) è la base da cui estrarre `googleDrive.js` e i componenti galleria/lightbox.*

1. Progetto su Google Cloud Console → abilita Drive API → genera API key.
2. Cartella Drive di test condivisa "chiunque con il link può visualizzare".
3. Chiamata REST: `GET .../drive/v3/files?q='FOLDER_ID' in parents...` con `fields=files(id,name,thumbnailLink)`.
4. Le immagini si servono dai `thumbnailLink`, variando il suffisso `=s...` per griglia vs lightbox.
5. Valida i rischi: velocità dei thumbnail, rate limit, paginazione (`pageToken`), ordinamento per nome file.

## Fase 3 — Sistema di configurazione e theming (2–3 giorni)

- `theme/tokens.css`: solo design tokens (`--color-*`, `--font-*`, `--space-*`). Tutto il CSS strutturale in `src/styles/` consuma esclusivamente i tokens — mai valori hardcoded.
- `config/*.js`: moduli ES che esportano oggetti semplici; le pagine li importano. Valida la config all'avvio (slug duplicati, folderId mancanti) con errori parlanti in console: quando configurerai il sito di un amico alle 23 di sera, ti ringrazierai.
- Test del sistema: due "temi" completi (chiaro/scuro, coppie di font diverse) cambiando solo `theme/`.

## Fase 4 — Componenti galleria (1–2 settimane)

- Griglia responsive (CSS columns o Grid) con lazy loading nativo.
- Lightbox a schermo intero: frecce, tastiera, swipe, focus gestito (accessibilità).
- Skeleton di caricamento e gestione errori con messaggi chiari (cartella non pubblica, key errata...).
- Cache in `sessionStorage` della lista file per album, per non richiamare l'API a ogni navigazione.
- Componenti scritti per essere usati sia dalla landing (card album) sia dalla pagina album.

## Fase 5 — Pagine e navigazione (4–6 giorni)

- **Landing**: hero con identità del fotografo + griglia delle card album generate da `albums.config.js` (cover = immagine locale in `public/` o prima foto della cartella).
- **Pagina album**: legge `?album=slug` con `URLSearchParams`, risolve l'album in config, carica le foto via provider. Slug inesistente → pagina 404 gentile con link alla landing.
- **Contatti con form**: un sito statico non può ricevere dati da solo. Opzioni gratuite e sicure, in ordine di preferenza:
  1. **Servizio form esterno** (es. Web3Forms o Formspree, piani free): il form fa POST al servizio, che inoltra via email. Endpoint/access key in config.
  2. Fallback minimale: link `mailto:` ben fatto (zero dipendenze, ma UX peggiore).
  - Anti-spam senza CAPTCHA invasivi: campo honeypot nascosto + validazione lato client. Non pubblicare mai l'email in chiaro nell'HTML (harvesting).
- Navigazione (header/footer) condivisa come componente, generata dalla config.

## Fase 6 — Deploy gratuito (1 giorno)

- **Cloudflare Pages** (consigliato) o GitHub Pages; build Vite multipagina, deploy automatico a ogni push.
- Dominio: sottodominio gratuito `*.pages.dev` o dominio proprio (~10 €/anno, unico costo opzionale).

## Fase 7 — Sicurezza e hardening (2–3 giorni)

- **Restrizione API key** su Google Cloud: solo Drive API + solo referrer HTTP del dominio del sito. La key resta visibile nel client (inevitabile senza backend) ma diventa inutilizzabile altrove e dà accesso solo a file già pubblici. Una key distinta per ogni sito/amico: revoca e monitoraggio indipendenti.
- Consapevolezza: le foto nelle cartelle condivise sono **pubbliche** per chi ha il link. Niente foto private; per i lavori valuta risoluzione ridotta o watermark.
- Security headers via file `_headers` (Cloudflare Pages): CSP che ammette solo googleapis/googleusercontent e l'endpoint del form, `X-Frame-Options`, `Referrer-Policy`.
- Form: validazione input, honeypot, rate limiting delegato al servizio form.
- Dipendenze al minimo e aggiornate: meno librerie = meno superficie d'attacco.

## Fase 8 — Boilerplate e flusso di condivisione (3–5 giorni)

Visto che le personalizzazioni le fai tu, il flusso è da sviluppatore:

- Repo come **GitHub Template Repository**: per ogni amico crei un nuovo repo dal template.
- `README.md` tecnico rivolto a te (e ad altri dev): checklist di setup — creare cartelle Drive, API key dedicata con restrizioni, compilare `config/`, ritoccare `theme/`, collegare a Cloudflare Pages.
- Documenta in `CUSTOMIZING.md` la mappa esatta di cosa toccare per ogni tipo di modifica (nuovo album, nuovo colore, nuovo testo): è la tua "API di personalizzazione".
- Migliorie al template (bugfix, nuove feature) nel repo base; i siti derivati le recuperano con un merge/rebase dal template — motivo in più per non sparpagliare le personalizzazioni fuori da `config/` e `theme/`.
- Test finale: crea un sito-clone da zero e cronometra. Target per te: < 30 minuti dal template al sito online.

## Fase 9 — Extra opzionali

- SEO: meta tag e Open Graph per pagina (titolo album nelle anteprime social), sitemap.
- Nuovi provider in `src/providers/` (cartella locale nel repo, altri cloud).
- Analytics privacy-friendly (Cloudflare Web Analytics, gratuito).
- Tema chiaro/scuro automatico (`prefers-color-scheme`), PWA.

---

## Riepilogo tempi e costi

| | |
|---|---|
| Tempo totale stimato | 5–8 settimane part-time |
| Hosting | 0 € (Cloudflare Pages / GitHub Pages) |
| Storage | 0 € (Drive incluso nell'account Google) |
| API Drive | 0 € per questi volumi |
| Form contatti | 0 € (piani free Web3Forms/Formspree) |
| Unico costo opzionale | dominio personalizzato ~10 €/anno |

**Prossimo passo concreto:** completare la Fase 2 collegando il proof of concept a una tua cartella Drive reale; poi impostare la struttura di Fase 1 e migrare il codice del PoC dentro `src/`.
