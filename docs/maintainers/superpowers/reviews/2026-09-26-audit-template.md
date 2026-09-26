# Audit del template — 2026-09-26

Stato esaminato: `main` a `e1e0fd4` (F2 e F3 uniti, PR #20 e #21). Tre prospettive: sicurezza di un sito deployato con l'attuale Terraform e codice, architettura, facilità di installazione e uso. Nessuna modifica al codice in questo audit.

Gravità: **Alta** = da correggere prima di condividere il template; **Media** = da correggere o documentare prima di condividerlo; **Bassa** = miglioramento.

## Verifiche eseguite

- `npm test` su `main`: 73 file, 577 test passati, 1 saltato. Build senza avvisi, con e senza `custom/`.
- Browser (Chromium 153, dati sintetici, back/forward cache attiva) su copie di `main`: template 17/17, `custom.example/` 24/24 (home, album e suoi stati, lightbox, ripristino avanti/indietro, About, isolamento del tema da `/admin`, pagine F3, `/contatti` non più alias).
- `wrangler dev` 4.107 su una build con valori sintetici: gli header di `_headers` (CSP, HSTS, X-Frame-Options) arrivano anche sulle pagine servite tramite il Worker (`/admin`, `/about`, pagine album), non solo sui file statici. Le risposte JSON di `/api/data/*` non li hanno (non servono).
- Prova in Chromium dell'iniezione HTML nel pannello Messaggi (S1), con la stessa CSP di produzione.
- Lettura di: `infra/*.tf`, `src/worker*`, `src/admin/**`, componenti pubblici, `buildHeaders`, `.gitignore`, README (EN e IT), runbook, `package.json`.

Non verificato: un deploy reale su Cloudflare, il login Access, il comportamento di Access su `workers.dev` (dedotto da `infra/access.tf` e dal runbook).

## Sicurezza

### S1 — Alta: HTML dal form pubblico iniettato nella dashboard (redirect di phishing verificato)

`src/admin/views/messages.js:55-65` inserisce `msg.name`, `msg.subject`, `msg.message` e `msg.email` con `innerHTML`, senza escaping. I messaggi arrivano da `/api/contact`, l'unica scrittura pubblica.

La CSP di produzione blocca l'esecuzione di script (verificato: `onerror` non parte). **Non blocca** un `<meta http-equiv="refresh">`: in Chromium, un messaggio che lo contiene reindirizza la dashboard all'URL scelto dall'attaccante appena l'admin apre Messaggi (verificato). Scenario: pagina che imita il login di Cloudflare Access. Permette anche link e markup ingannevoli. Se la CSP venisse un giorno allentata, diventerebbe XSS completo in una pagina autenticata.

Correzione: costruire la riga con `textContent` per nome, oggetto e testo, e `setAttribute('href', 'mailto:' + email)` per il link, come fanno già i componenti pubblici. Test: un messaggio con `<meta>`, `<img onerror>` e `"` nell'email deve comparire come testo.

### S2 — Media: i messaggi di contatto stanno nel bucket pubblico

`handleContactRequest` salva ogni messaggio (nome, email, testo) in `_messages/<data-ora al ms>-<6 caratteri>.json` nello stesso bucket R2 che `r2.dev` o il dominio foto servono pubblicamente. Un bucket R2 pubblico non si può elencare, e il suffisso (6 caratteri base36 da `Math.random`) rende impraticabile indovinare un nome. Resta però un dato personale esposto a chiunque conosca la chiave, per esempio da un log o da uno screenshot, e protetto solo da `Math.random`, che non è crittografico.

Correzione consigliata: un secondo bucket R2 privato (binding `MESSAGES`, senza dominio pubblico) creato da Terraform, oppure KV. Minimo indispensabile: `crypto.randomUUID()` al posto di `Math.random` e una nota nel README.

### S3 — Media: con Turnstile attivo, un secret mancante accetta tutto

`verifyTurnstile` restituisce `true` se `TURNSTILE_SECRET` è vuoto (`src/worker/turnstile.js`). Terraform crea il widget di default (`enable_turnstile = true`) e `infra:sync` scrive la sitekey, ma il secret va impostato a mano con `wrangler versions secret put`. Se il passaggio viene saltato, il widget compare ai visitatori e il server non verifica nulla. Il runbook lo dice (§ Turnstile, "fails open"); il README no.

Correzione: se `TURNSTILE_SITEKEY` è impostata e `TURNSTILE_SECRET` no, rifiutare con un errore esplicito (fail closed) invece di accettare; più il passaggio nel README.

### S4 — Media: senza dominio proprio la dashboard non è utilizzabile; con dominio proprio resta attivo anche `workers.dev`

- `infra/access.tf` limita Access ai percorsi `/admin` e `/api/admin` di `prod_hostname`; il commento sullo staging e il runbook ("Access application for `/admin` (custom domain only)") dicono che su `workers.dev` Access non limita per percorso. Con `prod_hostname = *.workers.dev`, come suggerisce il README ("domain optional"), la dashboard fallisce **chiusa**: il Worker rifiuta le richieste senza un JWT valido. È sicuro ma inutilizzabile, e l'errore non spiega perché.
- Con un dominio proprio, l'indirizzo `*.workers.dev` del Worker resta attivo di default: il sito pubblico è duplicato lì. L'API admin resta chiusa, perché il Worker verifica il JWT. Consiglio `"workers_dev": false` e `"preview_urls": false` in `wrangler.json` una volta attivo il dominio, documentato.

### S5 — Bassa: richieste non autenticate possono forzare il download delle chiavi Access

`getKey` in `src/worker/access-jwt.js` riscarica il JWKS a ogni `kid` sconosciuto, prima di verificare la firma. Chiunque può inviare a `/api/admin/*` token con `kid` sempre diversi e far partire una richiesta verso `<team>.cloudflareaccess.com` per ciascuno. Correzione: limitare i riscaricamenti (per esempio al massimo uno al minuto).

### S6 — Bassa

- `/api/contact` non ha un limite di frequenza oltre a Turnstile e all'honeypot. Senza Turnstile, uno spam riempie R2.
- `GET /api/admin/messages` legge una sola pagina di `list()` (al massimo 1000 oggetti): oltre, i messaggi più recenti non si vedono.
- `Strict-Transport-Security: includeSubDomains` sul dominio principale vale per tutti i sottodomini: da segnalare nel README a chi usa l'apex.

### Cosa è già solido

- Verifica del JWT di Access: firma RS256, `aud`, `iss`, `exp`, `nbf`; fallisce chiusa se mancano le variabili. È fatta dentro `handleAdminRequest`, quindi ogni route admin è protetta anche se cambia il routing.
- CSP rigida (`script-src 'self'`, niente inline), generata da `wrangler.json`, applicata anche alle pagine servite dal Worker (verificato).
- Nessun segreto negli output Terraform; `terraform.tfstate`, `*.tfvars`, `outputs.json` e `.env` sono ignorati da git; il token Cloudflare è solo in ambiente.
- Componenti pubblici: dati sempre con `textContent`. Guardie su path traversal nelle chiavi R2 (`SLUG_RE`, `PHOTO_NAME_RE`, `MESSAGE_ID_RE`). Limiti di dimensione sul form e sulle foto.

## Architettura

### A1 — Bene: le fonti uniche ci sono

Route del template (`TEMPLATE_ROUTES`), regole su slug e contenuti (`src/shared/content-rules.js`, condivise da sito, dashboard e Worker), CSP derivata da `wrangler.json`, valori infrastrutturali da Terraform tramite `infra:sync`, API pubblica unica per `custom/`. F2 e F3 non hanno lasciato duplicazioni note.

### A2 — Media: il repository porta con sé molto materiale interno

Chi fa il fork (e ogni `git merge upstream/main`) riceve:

- `docs/maintainers/superpowers/`: 50 file, 1,1 MB di piani, spec e review di sviluppo;
- nella radice `piano-implementazione.md` e `roadmap-sito-portfolio.md`, che descrive ancora la vecchia architettura basata su Google Drive: fuorviante;
- `docs/maintainers/platform-direction.md`, `docs/maintainers/platform-roadmap.md`, `docs/maintainers/azioni-manuali.md` (il diario delle azioni manuali del maintainer);
- `mockups/`: 5 file tracciati, anche se `.gitignore` contiene `mockups/*`.

Correzione consigliata: spostare il materiale interno in `docs/maintainers/` (o su un branch separato) ed eliminare dalla radice i documenti superati. Così nella radice restano README, CUSTOMIZING, CONTRIBUTING e LICENSE.

### A3 — Bassa: difetti minori

- `src/admin/views/messages.js:19` usa `style="display:none;"`: la CSP di produzione ignora gli attributi `style`, quindi la scritta "nessun messaggio" resta visibile anche con dei messaggi. Correzione: una classe CSS, o l'attributo `hidden`.
- `package.json` non ha `engines`: la versione di Node richiesta non viene controllata (vedi U1).
- `VITE_R2_PUBLIC_URL` (`.env`) e `R2_PUBLIC_URL` (`wrangler.json`) sono due fonti dello stesso valore. Il README lo spiega, ma è un doppione evitabile.
- I testi dell'interfaccia di default sono in italiano (`config/texts.config.js`), mentre documentazione ed esempi sono in inglese. Va bene, ma il README dovrebbe dirlo e indicare il file da cambiare.

## Facilità di installazione e uso

### U1 — Alta: la versione di Node indicata è sbagliata

README (EN e IT): "Node.js 20+" e `node --version   # requires v20+`. Vite 8 richiede `^20.19.0 || >=22.12.0`; `wrangler`, usato in tutta la documentazione (`npx wrangler …`), richiede `>=22`. Con Node 20 i comandi del runbook falliscono. Correzione: "Node.js 22.12+" in entrambi i README e `"engines": { "node": ">=22.12" }` in `package.json`.

### U2 — Alta: "dominio opzionale" non è vero per un sito utilizzabile

Il README dice che il dominio è facoltativo; il runbook dice "richiesto prima di andare online", e senza dominio la dashboard non funziona (S4). Un amico che parte senza dominio si ferma al primo accesso ad `/admin`, senza capire perché. Correzione: dire chiaramente che per la dashboard serve un dominio su Cloudflare, e cosa si può provare senza (sito pubblico in locale, anteprima).

### U3 — Media: l'ordine dei passaggi nel README non è lineare

"Getting started" chiede di compilare `wrangler.json` e fare commit subito dopo il clone, prima che l'infrastruttura esista; i valori arrivano solo dal passo 1 di "Setting up". Poi ci sono "Quick start" e "Setting up" con passaggi che si sovrappongono. Correzione: un'unica lista numerata, dal fork al sito online:

1. fork e clone, `npm install`;
2. prova in locale (`npm run dev`);
3. infrastruttura con Terraform e `npm run infra:sync`;
4. commit di `wrangler.json`;
5. collegamento Git su Cloudflare e primo deploy;
6. secret (`TURNSTILE_SECRET`, eventualmente `CONTACT_NOTIFY_URL`);
7. `npm run migrate`;
8. primo accesso a `/admin` (codice via email) e primo caricamento;
9. controllo finale.

### U4 — Media: passaggi importanti solo nel runbook

Il README non nomina `TURNSTILE_SECRET` (S3), il suo esempio di `wrangler.json` non ha `TURNSTILE_SITEKEY`, non spiega come si entra in `/admin` la prima volta (Access, codice via email, l'email deve essere in `admin_emails`) e non dà un controllo finale ("apri il sito, invia un messaggio di prova, verificalo in Messaggi").

### U5 — Media: gli errori da evitare sono sparsi

Le trappole note sono documentate bene, ma in cinque file diversi: README, runbook, `docs/staging.md`, `docs/upgrading.md`, `docs/maintainers/azioni-manuali.md`. Serve una sezione "Errori da evitare" nel README, con una riga e un link per ciascuna:

- usare "Use this template" invece del fork;
- rilanciare `npm run migrate` dopo aver usato la dashboard;
- un aggiornamento in fast-forward che sostituisce il tuo `wrangler.json` con i segnaposto;
- mettere `keep_managed_domain = false` prima di aver verificato il dominio foto;
- usare `r2.dev` in produzione (è rate-limited);
- impostare sitekey e secret di Turnstile uno senza l'altro;
- non mettere `enable_staging = true` prima del primo `plan` dopo un aggiornamento, quando lo staging esiste già;
- scrivere l'URL di notifica in `wrangler.json` invece di usare un secret;
- `ALLOW_PLACEHOLDER_CSP=1` solo per le prove, mai per un deploy.

### U6 — Bassa: README incompleto o disallineato

- Il README italiano non ha il link a `docs/slots.md` (F2), che quello inglese ha; nessuno dei due cita `docs/pages.md` (F3).
- "Project structure" non elenca `src/api/` (l'unica cosa che `custom/` può importare), `src/shared/`, `src/admin/`, `docs/pages.md`.
- "What it does" parla di "contact page": oggi è la pagina About, con il form.
- Demo e screenshot sono "coming soon": per chi lo riceve da un amico, una schermata vale più di molte righe.
- Lo staging è dichiarato onestamente come "non chiavi in mano": va bene così.

## Priorità consigliate prima di condividerlo

1. **S1**: correzione di `messages.js` con test (piccola, alta gravità).
2. **U1, U2, U3, U4, U5**: README (EN e IT) riorganizzato in un percorso lineare, requisiti corretti, sezione "Errori da evitare"; `engines` in `package.json`.
3. **S3**: Turnstile che fallisce chiuso quando manca il secret.
4. **A2**: pulizia del materiale interno dal template.
5. **S2**: bucket privato per i messaggi (tocca Terraform e `wrangler.json`: da decidere).
6. **S4** (parte `workers_dev`), **S5**, **S6**, **A3**, **U6**: miglioramenti.

## Stato delle correzioni (priorità 1–4)

Branch `fix/audit-before-sharing`.

| Rilievo | Commit | Esito |
|---|---|---|
| S1 — messaggi mostrati come testo, mai come HTML; A3 — `hidden` al posto di `style` inline | `e303a08` | corretto, con test che include `<meta http-equiv="refresh">` |
| S3 — Turnstile con sitekey senza secret rifiuta (503) | `387a319` | corretto; runbook, staging e upgrading aggiornati |
| U1–U6 — README inglese come percorso ordinato, Node 22.12 (`engines`), "Mistakes to avoid" | `1328204` | corretto |
| U1–U6 — README italiano allineato | `5895fd8` | corretto |
| A2 — materiale interno spostato in `docs/maintainers/` | `cf2779a, aefe9ef` | corretto |

Rilievo aggiunto durante le correzioni:

- **U7 — Media: nessuna guida spiegava come collegare il dominio del sito al Worker.** Terraform crea Access su `prod_hostname`, ma non collega quel dominio al Worker; il README ora lo fa al passo 4 (Workers & Pages → Settings → Domains & Routes). Possibile miglioramento futuro: generare `routes` con `custom_domain: true` in `wrangler.json` da `infra:sync`.

S2 corretto sul branch `feat/s2-private-messages` (piano `docs/maintainers/superpowers/plans/2026-09-26-s2-private-messages-bucket.md`). S5 e S6 corretti sul branch `feat/s5-s6-hardening` (piano `docs/maintainers/superpowers/plans/2026-09-26-s5-s6-hardening.md`; limite di frequenza documentato come regola della dashboard). S4 e U7 corretti sul branch `feat/s4-u7-domain` (piano `docs/maintainers/superpowers/plans/2026-09-26-s4-u7-domain-from-wrangler.md`), da verificare su un account Cloudflare reale prima del merge: dominio collegato dal deploy, `workers.dev` spento, staging non toccato, Workers Builds autorizzato a creare il custom domain.

Verifica finale: `npm test` 73 file, 581 test passati; build riuscita, 0 avvisi; link dei documenti: 0 rotti.
