<div align="center">

# 📷 Photo Portfolio

**Un portfolio fotografico che si aggiorna da solo: carichi le foto da una dashboard, e sono online.**

Niente database. Nessun server da mantenere. Zero euro al mese.

[![Licenza: MIT](https://img.shields.io/badge/Licenza-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20%2B-brightgreen.svg)](https://nodejs.org)
[![Gira su](https://img.shields.io/badge/gira%20su-Cloudflare%20Workers-f38020.svg)](https://workers.cloudflare.com/)
[![Costo mensile](https://img.shields.io/badge/costo%20mensile-%E2%82%AC0-success.svg)](#-cosa-serve)

[🇬🇧 English](README.md) · **🇮🇹 Italiano**

🔗 **Demo dal vivo:** *(in arrivo)*

</div>

<!-- TODO: sostituire con uno screenshot reale della home, es. docs/screenshot-home.png
     Un portfolio fotografico si giudica guardandolo: questa immagine vale piu'
     di tutto il testo che segue.
![Il sito](docs/screenshot-home.png)
-->

---

## 🗂️ Indice

- [🤔 Perché esiste](#-perché-esiste)
- [✨ Cosa fa](#-cosa-fa)
- [📸 Screenshot](#-screenshot)
- [🧰 Cosa serve](#-cosa-serve)
- [🚀 Come partire, e come restare aggiornati](#-come-partire-e-come-restare-aggiornati)
- [⚡ Provarlo in locale](#-provarlo-in-locale)
- [⚙️ Allestire un nuovo portfolio](#-allestire-un-nuovo-portfolio)
- [⚠️ Errori da evitare](#-errori-da-evitare)
- [🖼️ Come si usa il sito una volta online](#-come-si-usa-il-sito-una-volta-online)
- [🎨 Personalizzazione](#-personalizzazione)
- [🏗️ Struttura del progetto](#-struttura-del-progetto)
- [🧱 Architettura](#-architettura)
- [🤝 Contribuire](#-contribuire)
- [⭐ Se ti è stato utile](#-se-ti-è-stato-utile)
- [🔮 Sviluppi futuri](#-sviluppi-futuri)
- [⚖️ Licenza](#-licenza)

> 📘 Le guide tecniche — [`CUSTOMIZING.md`](CUSTOMIZING.md) e il [runbook](docs/runbook-cloudflare.md) — sono **solo in inglese**. Tenerle in due lingue significherebbe aggiornarle due volte, e prima o poi lasciarne indietro una.

---

## 🤔 Perché esiste

I portfolio per fotografi finiscono quasi sempre in uno di due posti: un abbonamento mensile a una piattaforma che decide come deve apparire il tuo lavoro, oppure un sito statico che ti obbliga a ricompilare e ridistribuire ogni volta che aggiungi una foto.

Questo template sta nel mezzo. Il sito è statico e velocissimo, ma le foto vivono su un bucket **Cloudflare R2** e si caricano da una **dashboard protetta da login**: le aggiungi, le riordini, scegli la copertina, e il sito cambia subito — senza toccare il codice, senza fare un deploy.

È pensato per **fotografi che sanno programmare**, o per chi allestisce il sito a un amico che fotografa: il primo setup chiede di saper usare git e la console di Cloudflare, tutto il resto no.

## ✨ Cosa fa

- **Pagine** — home con gli album, pagina album con griglia e lightbox, pagina About con un form di contatto funzionante.
- **Dashboard `/admin`** — carica foto (compresse nel browser prima dell'invio), riordina per trascinamento o per data, scegli la copertina, crea ed elimina album, modifica nome, bio e social.
- **Accesso protetto** da Cloudflare Access — si entra con un codice via email, e nessuna password vive nel codice.
- **Tre aspetti già pronti** per le card degli album, si cambiano con una riga.
- **Tutto personalizzabile dai file di configurazione** — colori, font, spaziature e testi, compresi quelli della dashboard.
- **Infrastruttura descritta in Terraform**, oppure creabile a mano seguendo il runbook.
- **Intestazioni di sicurezza generate automaticamente**, allineate al tuo dominio senza che tu le scriva.

## 📸 Screenshot

*(in arrivo — home, vista album e dashboard di caricamento)*

## 🧰 Cosa serve

| | |
|---|---|
| ☁️ **Account Cloudflare** | il piano gratuito basta |
| 🌐 **Un dominio su Cloudflare** | serve per la dashboard `/admin`: Cloudflare Access sa proteggere solo `/admin` unicamente sul tuo dominio. Senza, puoi comunque provare il sito in locale |
| 🟢 **Node.js 22.12+** | `wrangler`, usato durante l'installazione, richiede Node 22 |
| 🧱 **Terraform 1.9+** | consigliato; il [percorso manuale](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) funziona anche senza |

Costo ricorrente: **zero**, salvo il dominio.

I testi dell'interfaccia sono in italiano: si cambiano in `config/texts.config.js`.

## 🚀 Come partire, e come restare aggiornati

**Fai un fork**, non usare "Use this template". Il fork conserva la storia git, e solo così potrai ricevere le migliorie future con un merge. "Use this template" crea un repo senza antenati comuni: comodo il primo giorno, definitivo per sempre.

Dopo il fork:

```bash
git clone git@github.com:TUO-UTENTE/TUO-REPO.git
cd TUO-REPO
git remote add upstream git@github.com:davidetarsi/PhotoPortfolioTemplate.git
npm install
# poi segui "Allestire un nuovo portfolio" qui sotto, nell'ordine
```

Per ricevere gli aggiornamenti, quando vuoi:

```bash
git fetch upstream
git merge upstream/main
```

I conflitti, se ci sono, cadranno su `config/`, `theme/` e `wrangler.json` — cioè su ciò che hai personalizzato tu. Tieni le tue modifiche dentro quei file e gli aggiornamenti resteranno indolori.

`wrangler.json` in particolare andrà in conflitto quasi sempre, perché il template lo distribuisce coi segnaposto e tu ci hai messo i tuoi valori: risolvi tenendo la tua versione, con `git checkout --ours wrangler.json`.

> ⚠️ **A meno che non vada in conflitto per niente.** Se non hai ancora committato nulla di tuo, git fa un fast-forward invece di un merge: niente conflitti, nessun avviso, e il tuo `wrangler.json` viene sostituito dai segnaposto in silenzio. Un comando ti dice in quale dei due casi sei, e [**docs/upgrading.md**](docs/upgrading.md) è la procedura normale per aggiornare la produzione.

> 💡 Preferisci un repo privato e slegato dal fork? Allora `git clone` di questo repo, poi ripunta `origin` sul tuo e aggiungi `upstream` come sopra: il risultato per gli aggiornamenti è identico.

## ⚡ Provarlo in locale

```bash
node --version   # richiede v22.12+
npm install
npm run dev      # → http://localhost:5173/
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build   # verifica solo che compili: non pubblicare mai questo output
```

L'anteprima locale mostra il seed di `config/`, senza foto: le foto stanno in R2, che si configura nella sezione successiva.

## ⚙️ Allestire un nuovo portfolio

Segui i passi nell'ordine: ognuno ha bisogno del precedente. Il [runbook Cloudflare](docs/runbook-cloudflare.md) *(in inglese)* ha i dettagli di ogni passo.

### 1. Crea l'infrastruttura

Con Terraform (consigliato): copia `infra/terraform.tfvars.example` in `infra/terraform.tfvars`, compilalo seguendo il [riferimento campo per campo](docs/runbook-cloudflare.md#32-variable-reference), poi esegui plan e apply come spiega il [percorso Terraform](docs/runbook-cloudflare.md#3-terraform-path), compresi il token API e i suoi permessi. Crea due bucket R2 — uno pubblico per le foto e uno privato per i messaggi di contatto —, l'applicazione Access che protegge `/admin` e `/api/admin`, e il widget Turnstile del form di contatto.

Poi scrivi i risultati in `wrangler.json`:

```bash
npm run infra:sync
```

Senza Terraform, segui il [percorso manuale](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) e compila `wrangler.json` a mano, partendo da `wrangler.example.json`.

### 2. Committa `wrangler.json`

```bash
git add wrangler.json
git commit -m "chore: la mia configurazione Cloudflare"
git push
```

Il deploy di Cloudflare legge questo file dal repository. Contiene identificativi, non segreti: i segreti vanno a Cloudflare al passo 5. La Content Security Policy viene generata da qui a ogni build.

### 3. Collega il repository a Cloudflare

Dashboard Cloudflare → **Workers & Pages → Create → Import a repository** ([runbook §6](docs/runbook-cloudflare.md#6-git-integration--connect-repository)):

- Build command: `npm test && npm run build`
- Build output directory: `dist`
- Production branch: `main`

Ogni push su `main` pubblica il sito.

### 4. Collega il tuo dominio al Worker

Con Terraform e `npm run infra:sync` non c'è niente da fare: `wrangler.json` contiene già il tuo dominio, e il primo deploy lo collega al Worker e spegne l'indirizzo doppione `workers.dev` (resta acceso se hai attivato lo staging). Controllalo in Workers & Pages → il tuo Worker → **Settings → Domains & Routes**. A mano, aggiungilo lì con **Add → Custom domain**, usando l'hostname scelto per Access. Finché il dominio non è collegato, la dashboard non riesce a farti entrare.

### 5. Imposta i segreti

Dopo `npx wrangler login`:

```bash
npx wrangler versions secret put TURNSTILE_SECRET     # la chiave segreta del widget Turnstile
npx wrangler versions secret put CONTACT_NOTIFY_URL   # facoltativo: una notifica push per ogni nuovo messaggio
```

`versions secret put` prepara una nuova versione senza pubblicarla: promuovila dalla scheda **Deployments** del Worker, oppure fai un push. La chiave segreta è nella dashboard in **Turnstile → il tuo widget**. Se la sitekey è in `wrangler.json` e questo segreto manca, il form di contatto rifiuta ogni messaggio, apposta. Notifiche e loro limiti: [runbook §9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection).

### 6. Carica il contenuto iniziale

Compila i file del seed:

- **`config/site.config.js`** — nome, bio, social, hero
- **`config/albums.config.js`** — album, con slug, titolo, descrizione e nome del file di copertina
- **`config/texts.config.js`** *(facoltativo)* — testi dell'interfaccia
- **`config/admin.config.js`** *(facoltativo)* — stile della dashboard
- **`theme/tokens.css`** e **`theme/typography.css`** — colori, font e link a Google Fonts

Poi copiali in R2, una volta sola. `npm run migrate` legge quattro variabili R2 da `.env` (copia `.env.example`; crea un token API R2 con permesso di scrittura sul tuo bucket):

```bash
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="il-tuo-bucket"
```

```bash
npm run migrate
```

> ⚠️ `migrate` serve una volta sola, all'inizio. **Rilanciarlo dopo aver usato la dashboard riporta tutto al seed.** Se ne accorge, si ferma e chiede `--force`.

`VITE_R2_PUBLIC_URL` in `.env` è facoltativo: lo usa solo l'anteprima locale. `npm run upload` usa le stesse credenziali per caricare una cartella già pronta senza passare dalla dashboard.

### 7. Entra in `/admin`

Apri `https://il-tuo-dominio/admin`. Cloudflare Access chiede la tua email e ti manda un codice monouso: entrano solo gli indirizzi elencati in `admin_emails`. Crea un album e carica qualche foto.

### 8. Controlla che tutto funzioni

- La home elenca i tuoi album, e un album mostra le foto che hai caricato.
- Dalla pagina About mandati un messaggio: compare nella dashboard in **Messaggi**, e come notifica se l'hai configurata.
- `https://<worker>.<account>.workers.dev` non risponde più; se hai collegato il dominio a mano o attivato lo staging risponde ancora, e lì `/admin` non deve farti entrare.

Esiste un ambiente di staging facoltativo, ma non è pronto all'uso per una prima installazione: vedi [`docs/staging.md`](docs/staging.md) *(in inglese)*.

## ⚠️ Errori da evitare

| Non fare | Fai invece |
|---|---|
| Usare "Use this template" | Fai un fork, così potrai ricevere gli aggiornamenti ([sopra](#-come-partire-e-come-restare-aggiornati)) |
| Usare Node 20 | Node 22.12 o successivo |
| Lasciare il sito senza il tuo dominio | Collegalo al Worker (passo 4): `/admin` funziona solo lì |
| Rilanciare `npm run migrate` dopo aver usato la dashboard | Modifica i contenuti da `/admin`; `migrate` serve solo la prima volta |
| Fare il merge di un aggiornamento senza guardare `wrangler.json` | Segui [docs/upgrading.md](docs/upgrading.md): un fast-forward sostituisce i tuoi valori coi segnaposto senza alcun conflitto |
| Pubblicare una build fatta con `ALLOW_PLACEHOLDER_CSP=1` | Usala solo per verificare che il template compili |
| Mettere un URL di notifica o qualunque segreto in `wrangler.json` | `npx wrangler versions secret put …`: il file è pubblico nel tuo repository |
| Impostare la sitekey di Turnstile senza il secret, o il contrario | Impostali entrambi, o nessuno ([runbook §9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection)) |
| Servire le foto di produzione da `r2.dev` | Aggiungi un dominio per le foto ([runbook §8](docs/runbook-cloudflare.md#8-custom-domain-for-photos)): `r2.dev` ha limiti di traffico |
| Mettere `keep_managed_domain = false` prima che il dominio foto funzioni | Verifica prima il dominio, poi spegni `r2.dev` |
| Aggiornare un'installazione che ha già lo staging senza `enable_staging = true` | Impostalo prima del primo `terraform plan`, altrimenti Terraform propone di distruggere lo staging |


## 🖼️ Come si usa il sito una volta online

La dashboard `/admin` è il posto dove dai forma al sito mentre è in funzione:

- **Sezione Sito** — modifica nome, bio, hero, link social
- **Sezione Album** — aggiungi album, modificane titolo e descrizione
- **Vista album** — carica foto, riordinale, eliminale

I file in `config/` sono solo il seed iniziale — dopo `migrate`, la verità è R2. Le modifiche fatte dalla dashboard sono online subito, senza deploy.

## 🎨 Personalizzazione

Leggi [`CUSTOMIZING.md`](CUSTOMIZING.md) *(in inglese)* per sapere:

- Dove mettere le mani per ogni tipo di modifica
- La distinzione tra contenuto (R2 + dashboard) e aspetto/testi (file)
- Cosa non toccare, per evitare conflitti ai futuri merge dal template

Per sostituire componenti delle pagine, eventi del ciclo di vita e tema personalizzato, vedi la [guida alle estensioni](docs/slots.md) *(in inglese)*. Per aggiungere pagine tue — un archivio, una pagina per progetto — vedi [pagine](docs/pages.md) *(in inglese)*. Copia [`custom.example/`](custom.example/) in `custom/` per provare entrambe in locale.

## 🏗️ Struttura del progetto

```
config/          ← seed iniziale: identità, album, testi, stile admin
theme/           ← aspetto: design token CSS, tipografia, Google Fonts
src/pages/       ← entry point JS per ciascuna pagina
src/components/  ← componenti UI riusabili
src/styles/      ← CSS strutturale (importa solo i token)
src/utils/       ← funzioni pure e utilità di build
src/shared/      ← regole condivise da sito, dashboard e Worker (slug, validazione)
src/api/         ← l'API pubblica: l'unica cosa che custom/ può importare
src/worker.js    ← Cloudflare Worker
src/core/        ← registro degli slot e ciclo di vita delle pagine: le parti che un fork può sostituire
src/admin/       ← la dashboard /admin
custom.example/  ← esempio di custom/, dove un fork sostituisce parti del sito
infra/           ← configurazione Terraform (facoltativa)
scripts/         ← strumenti: migrate, upload, compress
docs/            ← guide: runbook, staging, aggiornamenti, slot, pagine (note del maintainer in docs/maintainers/)
public/          ← asset statici (favicon). `_headers` non sta qui: si genera in dist/
```

## 🧱 Architettura

| Strato | Tecnologia |
|---|---|
| **Hosting** | Cloudflare Workers (asset statici + API per `/admin`) |
| **Storage foto** | Cloudflare R2 (bucket pubblico via r2.dev o dominio custom) |
| **Autenticazione admin** | Cloudflare Access (Zero Trust) con JWT |
| **Bundler** | Vite 8.x multipagina — entry point in `vite.config.js` |
| **Intestazioni di sicurezza** | generate da `wrangler.json` a build time |
| **Meta tag OpenGraph** | iniettati a build time da `site.config.js` |
| **Framework** | vanilla JS/HTML/CSS — nessun framework a runtime |
| **Compressione foto** | `npm run compress -- --input <percorso>` — per HEIC, TIFF e caricamenti massivi (Sharp, WebP 1900px q85) |
| **Upload foto diretto** | `npm run upload -- --album <slug> --input <optimized-directory>` — carica direttamente su R2 una directory preparata e il suo `manifest.json`; richiede le credenziali facoltative in `.env` e non è il normale flusso della dashboard. |

## 🤝 Contribuire

Segnalazioni e pull request sono benvenute. Se hai costruito qualcosa con questo template, aprire una issue solo per dirlo è davvero utile: mi dice quali parti la gente usa per davvero.

Se correggi qualcosa in `src/`, valuta di riportarlo a monte — così chi forkerà dopo di te se lo ritrova già fatto, e tu non dovrai riapplicarlo a ogni merge.

**Come contribuire:** Vedi [`CONTRIBUTING.md`](CONTRIBUTING.md) per le convenzioni su commenti nel codice, messaggi di commit e il flusso di contribuzione.

## ⭐ Se ti è stato utile

Questo template è gratis, e resta gratis. Non c'è nulla da pagare e nulla da sbloccare.

Quello che serve davvero, e non ti costa niente:

- **Metti una stella al repository** — è l'unico segnale che mi dice che qualcuno l'ha trovato utile.
- **Apri una segnalazione quando qualcosa si rompe.** Soprattutto durante il setup: se ti sei bloccato in un punto, ci si bloccherà anche il prossimo, e preferisco correggere le istruzioni piuttosto che lasciarlo succedere due volte.
- **Raccontami cosa ci hai costruito.** Una issue, un link, due righe. Sapere quali parti la gente usa davvero è ciò che decide cosa migliorare dopo.

Se hai corretto qualcosa nel tuo fork, valuta di aprire una pull request: chi arriva dopo se la ritrova già fatta, e tu smetti di riapplicarla a ogni aggiornamento.

## 🔮 Sviluppi futuri

Dove andrà probabilmente. Sono intenzioni, non promesse:

- **Anteprima prima di pubblicare.** Oggi caricare, riordinare ed eliminare foto ha effetto immediato. L'idea è farle restare in bozza, guardabili prima che vadano online — come già funziona per nome e bio.
- **Anteprime social per home e about.** I link agli album mostrano già titolo e copertina propri. Home e about usano ancora i valori scritti al build; servirle attraverso il Worker permetterebbe anche a loro di seguire le modifiche fatte dalla dashboard, al costo di una chiamata al Worker a ogni visita della home.
- **Un tema chiaro già pronto.** Ora che ogni colore vive in `theme/tokens.css`, aggiungere una seconda palette è soprattutto questione di scegliere buoni valori.
- **Altre varianti di card**, se le tre incluse non coprono quello che serve.

Hai un'idea diversa? Apri una segnalazione — questo elenco lo decide chi lo usa.

## ⚖️ Licenza

[MIT](LICENSE) — usalo, modificalo, ridistribuiscilo, anche per lavoro. L'unica cosa da conservare è la nota di copyright.

Non sei tenuto a pubblicare il codice del tuo sito, e non lo sarai mai. È una scelta deliberata: un portfolio personale è tuo.
