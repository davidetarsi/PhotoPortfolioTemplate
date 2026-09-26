# Boilerplate template — stato e cose da sistemare

> Nota a partire da una conversazione su come esportare questo progetto come template riutilizzabile (portfolio fotografico, casa vacanze, galleria d'artista...). Il progetto è nato con questo intento — vedi `CUSTOMIZING.md` e milestone M8 — ma la migrazione da Google Drive a R2+Worker+dashboard admin lo ha reso in parte stantio.

## Modello mentale: contenuto vs aspetto

Due canali diversi, da non confondere:

- **Contenuto** (nome, bio, hero, album, foto): a runtime la fonte di verità è **R2**, non i file di config. `config/site.config.js` e `config/albums.config.js` sono solo il *seed iniziale* — `npm run migrate` li trasforma nei JSON su R2 una tantum. Se rilanci `migrate` dopo aver usato la dashboard, **sovrascrivi le modifiche fatte dalla dashboard**. Le due strade non sono canali paralleli permanenti: migrate è bootstrap, la dashboard è l'uso quotidiano.
- **Aspetto e testi UI** (colori, font, spaziature, copy): questi sì restano solo-file — `theme/tokens.css`, `theme/typography.css`, `config/texts.config.js` — e valgono **anche per la dashboard admin**, perché `src/styles/admin.css` importa gli stessi token. Cambiare `--color-accent` ricolora sito pubblico e dashboard insieme, gratis.

## Cosa manca per un template pulito (~1 giornata)

1. **`CUSTOMIZING.md` è stantio** — parla ancora di Google Drive (`driveApiKey`, `driveFolderId`, URL `lh3.googleusercontent.com`), architettura non più esistente (ora R2+Worker+dashboard). Va riscritto da zero per lo stato attuale. Il pezzo più corposo, ma solo scrittura. **~2h**

2. **CSP hardcodata** — [public/_headers](../../../public/_headers) contiene gli URL R2 reali (prod + staging) scolpiti nel file:
   ```
   img-src ... https://pub-xxxxxxxx.r2.dev https://pub-yyyyyyyy.r2.dev ...
   ```
   Ogni clone del template ha bucket/URL diversi. Da generare a build time (stesso meccanismo di `injectSiteMeta` in `vite.config.js` che già inietta i placeholder `{{SITE_*}}` negli HTML) invece di tenerlo statico. **~1h + test**

3. **`wrangler.json` da sistematizzare** — nomi worker, bucket, Access team domain/AUD sono per-clone. In parte già placeholder (`replace-with-real-production-bucket-name`), serve renderlo coerente su tutti i campi e documentare quali righe toccare. **~30min**

4. **Runbook Cloudflare** — bucket R2, API token, Access application, Git integration, `migrate`: passi manuali non esportabili come codice, ma documentabili come checklist. In gran parte già scritto/vissuto durante il deploy prod (vedi `2026-07-12-prod-deploy-access.md`) — da consolidare, non da riscrivere da zero. **~1h**

**Opzionale, rimandabile:** le stringhe della dashboard admin sono hardcodate in italiano nei file JS (`home.js`, `album.js`, `status.js`, `preview.js` — verificato il 2026-07-12), non passano da `texts.config.js`. Per un template multiuso/multilingua andrebbero spostate sotto una chiave `texts.admin.*`. Meccanico ma esteso, un paio d'ore.

## Sequenza consigliata

1. Finire il deploy prod ([2026-07-12-prod-deploy-access.md](2026-07-12-prod-deploy-access.md))
2. Scrivere il runbook Cloudflare con i passi appena vissuti e verificati (non ricostruiti a memoria)
3. Sistemare i 4 punti sopra
4. Repo → "Use this template" su GitHub con i valori personali svuotati
