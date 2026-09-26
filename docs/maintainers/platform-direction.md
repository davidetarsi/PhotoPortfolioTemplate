# Direzione architetturale — PhotoPortfolio Template

**Data:** 20 settembre 2026
**Stato:** direzione proposta, precedente all'implementazione
**Ambito:** evoluzione di `PhotoPortfolioTemplate` da boilerplate Drive-based a template fotografico self-hosted, consegnabile a sviluppatori.
**Sostituisce:** le bozze `photo_portfolio_platform_analysis.md` / `photo_portfolio_platform_roadmap.md`.
**Segue:** il ciclo M0–M8 già completato (vedi `roadmap-sito-portfolio.md` e `piano-implementazione.md`, ora storici).

---

## 1. La decisione che governa tutte le altre

**Il destinatario del template è uno sviluppatore che fotografa.**

Non un fotografo non tecnico. Questa è la premessa originale del progetto ed è già scritta nella roadmap v2: *"le personalizzazioni per gli amici le fai tu — quindi la configurazione può essere organizzata come uno sviluppatore si aspetta, non come un non-tecnico."*

Va riaffermata perché è costata cara perderla: appena si assume un destinatario non tecnico, la superficie del prodotto si gonfia con wizard interattivi, editor visuali dei temi, liste di font consentite, bozza/pubblicato, revisioni e rollback — cioè la maggior parte del lavoro, tutta a servizio di un utente che non esiste in questo progetto.

Con il destinatario giusto, le conseguenze a cascata sono:

| Domanda | Risposta per un destinatario sviluppatore |
|---|---|
| Come si configura una nuova installazione? | File in repo + variabili d'ambiente + un README onesto. Niente wizard obbligatorio. |
| Come si crea l'infrastruttura? | `terraform apply`. È il formato che quel pubblico si aspetta e sa valutare. |
| Come si cambia tema? | Si edita `theme/tokens.css` e si fa deploy. Trenta secondi, nessuna UI necessaria. |
| A cosa serve allora la dashboard? | Alle operazioni quotidiane sui **contenuti** — caricare foto, riordinare, cover, bio — che non devono richiedere un deploy, e a vederne il risultato prima di salvare. |
| Serve impedire CSS arbitrario? | No. Ha accesso al repo. I "limiti intenzionali" contro l'utente sono teatro. |
| Chi fa il primo setup? | Il destinatario stesso, con la documentazione. Se non ci riesce, è un bug della documentazione. |

Tutto ciò che in questo documento non serve a *quel* destinatario è fuori scope.

## 2. Doppio obiettivo, senza ambiguità

Il progetto deve servire due scopi insieme, e sono compatibili:

1. **Progetto software da portfolio/CV.** Dimostra frontend senza framework, backend serverless, object storage, autenticazione, Infrastructure as Code, CI/CD, testing e documentazione.
2. **Template realmente consegnabile** ad alcuni amici sviluppatori che fotografano, ognuno sul proprio account e dominio.

Sono compatibili perché il pubblico è lo stesso: chi valuta il repo come artefatto professionale e chi lo installa sono entrambi sviluppatori. Ciò che rende il repo credibile a un revisore — setup riproducibile, infra dichiarata, test, documentazione onesta — è esattamente ciò che lo rende installabile da un amico.

Dove i due scopi divergono, vince la **consegnabilità**: una funzionalità che nessun destinatario userebbe non diventa credibile solo perché sta bene in un CV.

## 3. Stato di partenza, misurato

### 3.1 `PhotoPortfolioTemplate` (questo repo)

Verificato al 20 settembre 2026:

- Vite 8, Vitest 4, JavaScript senza framework, multipagina (`index`, `album`, `contatti`).
- 14 file di test.
- `config/` — `site.config.js`, `albums.config.js`, `texts.config.js`.
- `theme/` — `tokens.css`, `typography.css`.
- `src/providers/` — `provider.js` (contratto), `googleDrive.js`, `cache.js`, `errors.js`.
- `src/components/` — 7 componenti, ognuno con test.
- `scripts/compress.js` (sharp, WebP).
- Deploy Cloudflare Workers, documentato in `SETUP.md` e `CUSTOMIZING.md`.
- **Assenti:** Worker applicativo, R2, dashboard, autenticazione, staging.

Il template ha quindi già la prima metà dell'architettura target: separazione config/tema/codice e un layer provider astratto. Gli manca tutta la parte dinamica.

### 3.2 `PhotoPortfolio` (sito personale)

Ha esattamente ciò che manca al template:

- `src/worker.js` + `src/worker/` — `access-jwt.js`, `admin-routes.js`, `data-routes.js`, `http.js`.
- `src/admin/` — 14 file: API, encoder, EXIF, naming, pipeline, preview, router, sortable, status, upload-manager, viste.
- `src/providers/` — `r2.js`, `data.js`.
- `src/shared/content-rules.js` — validazione condivisa client/Worker.
- `src/admin/preview.js` — anteprima del sito con i valori correnti del form, che riusa le funzioni di render del sito pubblico invece di reimplementarle.
- `src/admin/{pipeline,encoder,exif}.js` — compressione client-side all'upload, gemella di `scripts/compress.js`.
- `scripts/` — `compress.js`, `migrate.js`, `upload.js`, ognuno con test.
- Cloudflare Access su `/admin`, ambiente staging separato con bucket e public URL propri.
- Album come **dati runtime su R2**, non come file di configurazione.

### 3.3 Quanto codice è realmente condiviso

Confronto file-per-file sui path presenti in entrambi i repo:

| File | Stato |
|---|---|
| `ContactForm.js`, `texts.config.js`, `hero.css`, `nav.css` | **identici** |
| `Nav.js` (2), `AlbumCard.js` (8), `Lightbox.js` (12), `Hero.js` (13), `Footer.js` (16), `tokens.css` (1) | divergono di poche righe |
| `PhotoGrid.js` (94), `photo-grid.css` (43) | divergono in modo sostanziale (masonry del sito personale) |

**Due conclusioni operative:**

1. La duplicazione esiste ma è **superficiale**: i componenti sono già quasi gli stessi, con circa cinquanta righe di drift complessivo oltre a PhotoGrid. Non è un problema di manutenzione che giustifichi un package condiviso.
2. Il lavoro vero **non è portare il template dentro il sito personale**, ma il contrario: estrarre `admin/`, `worker/`, `providers/r2.js` e `content-rules.js` *dal sito personale verso il template*, generalizzandoli. Il sito personale è il ramo avanzato; il template è quello da far salire di livello.

Questo inverte la direzione di una delle milestone delle bozze precedenti, ed è la correzione più importante di questo documento.

## 4. Principio architetturale

Il confine da rendere verificabile è tra **motore** e **installazione**.

Quattro tecniche, tutte già parzialmente presenti:

1. **Configuration-driven** — le varianti supportate si selezionano da configurazione, non modificando `src/`.
2. **Content-as-data** — testi e metadati non vivono dentro i componenti. Nel template base stanno in file; nella modalità avanzata su R2.
3. **Design token** — colori, font, spaziature e misure passano da variabili semantiche in `theme/tokens.css`.
4. **Ports & adapters** — Drive, R2 e dati locali restituiscono lo stesso modello normalizzato; i componenti non conoscono la sorgente.

Criterio di verifica, unico e concreto: **una nuova installazione ordinaria non tocca `src/`.**

## 5. Le due modalità del template

Il template deve supportare due configurazioni, non un continuum:

| | **Base** | **Avanzata** |
|---|---|---|
| Sorgente foto | Drive o file locali | R2 tramite Worker |
| Album | `config/albums.config.js` | JSON runtime su R2 |
| Dashboard | assente | `/admin` protetta da Access |
| Infrastruttura | nessuna | Terraform (R2, DNS, Access) |
| Deploy | build statica | Worker + asset |
| Per chi | chi vuole provare in mezz'ora | chi consegna un sito vero |

La modalità base esiste perché rende il repo valutabile senza account Cloudflare — conta sia per il pubblico CV sia per la demo. La modalità avanzata è quella che consegni agli amici. Il frontend è **lo stesso** in entrambe: è questa la dimostrazione che l'architettura provider funziona.

## 6. Superficie di personalizzazione

| Esigenza | Dove |
|---|---|
| Nome, ruolo, bio, social | `config/site.config.js` |
| Testi dell'interfaccia | `config/texts.config.js` |
| Album (modalità base) | `config/albums.config.js` |
| Colori, font, spaziature, radius | `theme/tokens.css` |
| Logo, favicon, ritratto, cover di default | `public/` |
| Provider e funzionalità attive | `config/site.config.js` |
| Credenziali | variabili d'ambiente e secret, mai nel repo |

Restano file JavaScript, non YAML. Introdurre YAML + Markdown + schemi di validazione aggiungerebbe un parser, un layer di validazione e una classe di errori nuova, per servire un destinatario che sa già leggere un file `.js`. Se un giorno il pubblico cambia, si aggiunge; oggi no.

**Debito noto sui token:** i Google Font sono referenziati in un `<link>` hardcoded e duplicato in ogni file HTML. Finché resta così, cambiare coppia di font non è un'operazione da solo `tokens.css`. Va risolto quando si consolida il sistema dei temi. *(Nel sito personale esiste anche un `var(--font-display)` mai definito in `tokens.css`: il titolo dell'hero eredita il font di sistema invece di quello scelto. Da verificare anche qui.)*

## 7. Provider e modello normalizzato

Il contratto esiste già in `src/providers/provider.js` e va portato a tre implementazioni complete:

- **locale** — manifest e immagini nel repo; serve per demo, sviluppo e test.
- **Google Drive** — già implementato; resta supportato ma **secondario**.
- **R2 via Worker** — da portare dal sito personale; è la modalità di consegna.

Modelli comuni: `SiteProfile`, `Album`, `Photo`. Nessun componente deve conoscere ID Drive, chiavi R2 o forme di risposta specifiche.

La verifica è una sola e va automatizzata: **la stessa suite di test di contratto gira su tutti i provider**. Se passa su tutti e tre, il confine è reale; se un provider ha bisogno di un test speciale, il confine è finto.

## 8. Immagini: la compressione c'è, le derivate no

La compressione è una funzionalità **acquisita e da conservare**, in entrambe le forme in cui esiste oggi:

- `scripts/compress.js` — Node e sharp, da riga di comando, con test. Serve alla modalità base e ai caricamenti massivi.
- `src/admin/{pipeline,encoder}.js` — l'equivalente nel browser, usato dalla dashboard all'upload. Stesse regole: lato massimo 1900px, qualità 0.85, mai ingrandire, pass-through per i WebP già ottimizzati. Safari non sa codificare WebP da canvas, quindi c'è un fallback WASM caricato pigramente solo dove serve.

Questa doppia implementazione è una scelta corretta — la dashboard non può dipendere da Node — ma va **riconosciuta come vincolo**: le regole di compressione vivono in due posti e devono restare allineate. Le parti pure (`targetDimensions`, `shouldUploadAsIs`) sono già isolate in `pipeline.js` e sono il punto naturale da condividere fra le due implementazioni invece di duplicarle una terza volta.

Ciò che manca davvero sono le **derivate**: nessuna delle due genera più dimensioni per la stessa foto. Una griglia scarica immagini da 1900px e le scala via CSS a 300. Per un prodotto *fotografico* è la lacuna con più impatto percepito, ed è assente da entrambi i repo e da entrambe le bozze precedenti.

Target minimo:

- generazione di 2–3 derivate per foto (griglia, lightbox, originale);
- `srcset`/`sizes` sui componenti immagine;
- `width`/`height` o `aspect-ratio` per evitare layout shift;
- lazy loading già presente, da confermare.

Un amico che apre la galleria in 4G nota questo prima di qualsiasi altra cosa nel documento.

## 9. Infrastruttura: Terraform

Con destinatari sviluppatori, Terraform è la scelta giusta — non per necessità di scala, ma perché è **il formato di consegna leggibile** per quel pubblico: descrive cosa viene creato sull'account *loro*, è ispezionabile prima di applicarlo con `plan`, ed è ripetibile.

**Gestito da Terraform:** bucket R2 di produzione, bucket di staging (opzionale), record DNS, applicazione e policy Cloudflare Access, output consumati dal deploy.

**Non gestito da Terraform:** fotografie e manifest, contenuti runtime, bundling e deploy del Worker, acquisto del dominio, secret applicativi.

**Ownership**, da fissare una volta e documentare: Terraform possiede le risorse persistenti; Wrangler e CI/CD possiedono build, deploy e binding. Nessuna proprietà è scritta da entrambi.

**Stato:** locale per la prima installazione, mai committato; backend remoto R2 solo come passo documentato e opzionale (c'è un problema di bootstrap — il bucket di stato deve esistere prima di poterlo usare).

**Rischio reale:** il provider Terraform di Cloudflare ha una storia di cambi di schema fra major version. Bloccare la versione, e mettere `fmt`/`validate` in CI.

## 10. Dashboard: cosa entra nella v1

La dashboard **è parte del prodotto**, non un'opzione: gestire album e foto da riga di comando o da commit è scomodo anche per uno sviluppatore, e la comodità quotidiana è esattamente ciò che rende il sito consegnabile invece che solo installabile. Quello che la dashboard *non* è, è un editor di configurazione visuale.

**Dentro la v1** — è ciò che il sito personale già fa e che va generalizzato:

- creazione, modifica ed eliminazione degli album;
- **upload con compressione** (`pipeline.js` + `encoder.js`, incluso il fallback WASM per Safari — vedi §8);
- riordino delle foto, scelta della cover, testi degli album;
- profilo, bio, social;
- **anteprima del sito con le modifiche non ancora salvate** (`preview.js`);
- protezione Cloudflare Access e validazione sia nel browser sia nel Worker.

L'anteprima merita una nota architetturale, perché è fatta bene e va conservata così: `preview.js` riusa `renderHero`, `createAlbumCard`, `PhotoGrid`, `Lightbox` e la logica di pagina **del sito pubblico**, invece di reimplementare un render parallelo. È ciò che impedisce all'anteprima di mentire, ed è anche un test implicito del confine fra componenti e dati: se i componenti dipendessero dal provider, l'anteprima non potrebbe riusarli con i valori di un form.

**Fuori dalla v1:** selettore di temi, editor di colori e font, controlli di layout, **stato bozza persistito** lato server, cronologia delle revisioni, rollback multi-livello.

Da notare la distinzione, perché è sottile: l'**anteprima** (guardo com'è, prima di salvare) resta dentro; la **bozza persistita** (salvo una versione non pubblicata, ci torno domani, la confronto, la ripristino) resta fuori. La prima è un render locale e costa poco; la seconda richiede due stati sul server, una UI per gestirli e una storia di versioni. Per un destinatario con accesso al repo, "cambia tema" è una modifica a `tokens.css` seguita da un deploy — e `git revert` è già il rollback.

È questa distinzione, non l'eliminazione della dashboard, a rimuovere la milestone più costosa delle bozze precedenti.

## 11. Modello di distribuzione

**Single-tenant per installazione:** repo, account Cloudflare, bucket, dominio e dashboard di proprietà del destinatario.

Vantaggi: proprietà dei dati chiara, costi separati, isolamento dei guasti, nessuna responsabilità operativa permanente per Davide.

**Nota costi, da mettere nel README:** a scala hobby l'insieme sta nei piani gratuiti di Cloudflare (R2, Workers, Access con il suo limite di utenti). Va scritto perché è la prima domanda di chi riceve il template.

## 12. Aggiornamento delle installazioni

Va deciso adesso, non lasciato come questione aperta: è il problema che definisce il modello "template".

**Decisione: i fork non si aggiornano automaticamente, e va dichiarato.**

"Use this template" produce un repo scollegato, senza storia comune: non esiste un percorso di merge pulito. Le mitigazioni realistiche sono due, entrambe economiche:

1. Mantenere la superficie di personalizzazione **stretta e stabile** (`config/`, `theme/`, `public/`), così chi vuole aggiornare può aggiungere l'upstream come remote e portarsi le modifiche di `src/` con un cherry-pick gestibile.
2. Tenere un **CHANGELOG** con le modifiche che richiedono intervento sulle installazioni esistenti.

Questo è anche l'unico argomento serio a favore di un package condiviso — e non regge: vedi sotto.

## 13. Rapporto con il sito personale

**`PhotoPortfolio` non dipende dal template.** Restano due prodotti autonomi.

**Niente package `core` condiviso.** Con i numeri della sezione 3.3, un core conterrebbe sette componenti e un file di token già quasi identici: circa seicento righe, ferme. Il costo — versionamento, release, migrazioni, due consumer da tenere allineati — supera il beneficio. La duplicazione va **misurata di nuovo** se e quando esisteranno tre o più installazioni attive; fino ad allora, copiare è più economico che astrarre.

Il flusso di codice corretto è **dal sito personale verso il template** (sezione 3.3). Dopo che `admin/`, `worker/` e il provider R2 saranno generalizzati nel template, il sito personale riallinea i componenti che nel frattempo sono migliorati — un'operazione da poche decine di righe, non una milestone.

## 14. Decisioni

1. Il destinatario del template è uno sviluppatore che fotografa.
2. Il progetto serve insieme da artefatto da portfolio e da template consegnabile; in caso di conflitto vince la consegnabilità.
3. La personalizzazione ordinaria avviene fuori da `src/`, in file JavaScript — non YAML.
4. Il template supporta due modalità: base (file/Drive, statica) e avanzata (R2 + Worker + dashboard).
5. Il modello dati è indipendente dal provider; il confine è verificato da test di contratto condivisi.
6. La compressione resta in entrambe le forme (CLI e browser) con regole allineate; le derivate delle immagini sono una funzionalità di prima classe, non un'ottimizzazione tardiva.
7. Terraform gestisce le risorse persistenti; Wrangler e CI/CD gestiscono build e deploy; nessuna proprietà condivisa.
8. La dashboard fa parte del prodotto e la v1 include l'anteprima; gestisce contenuti, non configurazione visuale. Anteprima dentro, bozza persistita fuori.
9. Ogni destinatario ha una propria installazione single-tenant.
10. I fork non si aggiornano automaticamente; la superficie di personalizzazione resta stretta e il changelog documenta gli aggiornamenti che richiedono intervento.
11. Nessun package `core` condiviso. Da rivalutare solo a partire da tre installazioni attive.
12. Il codice generico si muove dal sito personale verso il template, non il contrario.
13. `PhotoPortfolio` non dipende da `PhotoPortfolioTemplate`.

## 15. Questioni aperte

Da risolvere nella milestone pertinente, non adesso:

- Se Google Drive resti supportato o passi a legacy dopo l'arrivo di R2.
- Quale modalità sia il default del repo: locale (prova immediata) o R2 (consegna reale).
- Numero e nomi dei preset di tema della prima release.
- Licenza del codice e licenza degli asset demo.
- Quante derivate generare e a quali dimensioni.
- Terraform o OpenTofu nella documentazione (l'HCL può restare compatibile con entrambi).
- Se staging sia predefinito o opzionale nel modulo Terraform.

## 16. Criteri di successo

La direzione è realizzata quando:

- un amico sviluppatore crea un repo dal template, segue il README e ottiene un sito funzionante sul proprio account e dominio, **senza chiederti nulla che non sia documentato**;
- carica album e foto dalla dashboard, senza toccare il codice;
- cambia l'aspetto modificando `theme/tokens.css` e facendo deploy;
- lo stesso frontend gira in modalità locale e in modalità R2 cambiando un solo valore di configurazione;
- le foto arrivano in dimensioni appropriate al contesto;
- il repo non contiene dati, domini, ID o fotografie di Davide;
- test e build passano da un clone pulito;
- esiste almeno **un'installazione reale non tua**;
- il progetto è presentabile come case study con demo, screenshot e diagramma.

L'ottavo punto è quello che vale tutti gli altri: fino ad allora, ogni decisione di prodotto è un'ipotesi.
