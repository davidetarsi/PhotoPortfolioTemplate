# Azioni che spettano a te

Cose che un agente non può fare al posto tuo: perché richiedono i tuoi permessi,
perché sono scelte tue, o perché sono irreversibili e vanno decise da una persona.

**Come si usa.** Alla fine di ogni punto dell'ordine dei lavori — dopo che è stato
pianificato, implementato e verificato — ti verrà ricordato che questo documento
esiste e che qui c'è qualcosa in sospeso. Le voci non bloccanti si possono
accumulare senza danno; quelle bloccanti fermano il lavoro e sono segnate come tali.

Ordine dei lavori di riferimento: [analisi §7](superpowers/specs/2026-09-20-template-distribuibile-analisi.md).

---

## In sospeso

### 🔧 Infrastruttura — la configurazione è provata contro l'API vera (22/09/2026)

| # | Azione | Blocca |
|---|---|---|
| 7B | Decidere se il sito vero passa sotto Terraform (con `import`) | niente, rimandabile |
| 7C | Verificare e progettare il bootstrap iniziale di staging | non blocca il sito esistente; blocca il claim che staging sia turnkey per un nuovo adopter |
| 8 | Dominio custom per le foto | niente d'altro, ma `r2.dev` è rate-limited |
| **9** | **I due secret del form, più il widget Turnstile da creare a mano** | la protezione antispam e le notifiche |

### 📢 Pubblicazione — la strada per darlo agli amici

| # | Azione | Blocca |
|---|---|---|

### 🖼️ Vetrina — quello che manca a chi arriva sul repo

| # | Azione | Blocca |
|---|---|---|
| 10 | Screenshot di home, album e dashboard | niente, ma è ciò che pesa di più |
| 11 | Link alla demo dal vivo | niente |

### 👀 Da guardare e decidere

| # | Azione | Blocca |
|---|---|---|
| 12 | Guardare le tre varianti di card e scegliere il default | niente |

### 🔄 Il tuo sito

| # | Azione | Blocca |
|---|---|---|
| 5 | ✅ Primo merge sito ← template — verificato il 23 settembre 2026 | niente |
| 6 | ✅ Deploy key dedicata a `PhotoPortfolio`, verificata con accesso in scrittura il 23 settembre 2026 | niente |

Le voci 5 e 6 sono chiuse. Il giro di sincronizzazione ha importato l'upstream
`b171728198973c0c0678cafc51684ea747c7b2ce`, ha prodotto il merge downstream
`79271528af6ed4aac8f264b44e147b282a51ba2f` e ha promosso lo stesso tree verificato
su staging e produzione al commit `439725711ba25f6ab4afd0abd9a5e8324c326535` il
23 settembre 2026. La deploy key dedicata a `PhotoPortfolio` è stata verificata con
un'operazione di scrittura.

Le lezioni operative del piano restano queste: salvare prima la configurazione reale,
non eseguire `npm run migrate` o `npm run infra:sync` dopo il merge se non richiesto,
verificare test, build e CSP prima della promozione, e portare in produzione lo stesso
tree già passato dai gate di staging. L'ascendenza o la divergenza tra i rami non
predicono i conflitti per singolo file: `wrangler.json` va preservato esplicitamente
anche quando Git non segnala un conflitto. Le configurazioni `config/*.config.js` sono
fallback che diventano comportamento pubblico live quando R2 non è disponibile, quindi
vanno migrate insieme alla configurazione reale. Se `main` e `staging` divergono,
fermarsi invece di risolvere alla cieca. La voce 7, che era la più urgente, è chiusa:
la configurazione Cloudflare è stata provata contro l'API vera. Resta la 9, che è
l'unica con una conseguenza silenziosa — senza `TURNSTILE_SECRET` il form non si rompe,
accetta tutto.

---

### 3. Rendere pubblico il repo template

**Dove:** GitHub → `PhotoPortfolioTemplate` → Settings → Danger Zone → Change visibility.

**Perché serve:** un repo privato non si può forkare da fuori il tuo account. Senza
questo, la decisione "si entra col fork" non funziona per nessuno dei tuoi amici.

**Prerequisito:** il punto 2 deciso e applicato.

**Fatto quando:** il repo è raggiungibile da un browser in incognito.

---

### 4. Togliere la spunta "Template repository"

**Dove:** GitHub → `PhotoPortfolioTemplate` → Settings → General → deseleziona
*Template repository*.

**Perché:** finché è attiva, GitHub mostra il bottone verde "Use this template", che
è esattamente la strada che abbiamo deciso di non far prendere a nessuno — crea repo
senza antenati comuni, incapaci di ricevere aggiornamenti. È la stessa cosa che ha
lasciato questo template indietro di un'architettura intera.

Il README spiega di forkare, ma un bottone verde vince su un paragrafo.

---

### 5. Primo merge sito ← template, con precauzioni — chiuso il 23 settembre 2026

**Dove:** sul tuo computer, nel repo `photoportfolio`.

> ⚠️ **Questa voce è stata riscritta il 22 settembre 2026, dopo aver provato il merge
> per davvero** in un clone usa-e-getta. La versione precedente descriveva un conflitto
> su `wrangler.json` che **non avviene**, e la procedura che suggeriva avrebbe messo in
> produzione i segnaposto del template. Sotto c'è quello che succede davvero.
>
> La versione generica di questa procedura, per chiunque usi il template, sta in
> [`docs/upgrading.md`](upgrading.md). Qui restano solo le peculiarità del tuo caso.

**Il primo aggiornamento non è un fast-forward:** lo `staging` personale ha commit
propri, quindi il merge con il template è un merge reale. `wrangler.json`, però, verrà
comunque sovrascritto senza conflitto: è rimasto invariato sul ramo personale dopo la
base comune, perciò Git vede la versione del template come l'unica modifica di quel
file. Senza un ripristino esplicito, accetterebbe in silenzio i segnaposto.

La maggior parte dei file è lavoro nuovo che vuoi, ma tre casi vanno gestiti a mano:

| File | Cosa succede | Va bene? |
|---|---|---|
| `wrangler.json` | i tuoi valori reali vengono **sostituiti dai segnaposto** | **no, va ripristinato** |
| `public/_headers` | viene cancellato | sì: dal punto 1 la CSP si genera a build time |
| `config/*.config.js` | tornano al seed neutro, ora fallback pubblico | **no: le configurazioni personalizzate vanno migrate** |

La procedura corretta, quindi, è mettere da parte la tua configurazione **prima** e
rimetterla **dopo**:

```bash
cd photoportfolio
git remote add upstream git@github.com:davidetarsi/PhotoPortfolioTemplate.git
git fetch upstream

cp wrangler.json ~/wrangler.sito.json          # i tuoi valori veri, fuori dal repo
git merge upstream/main                        # merge reale: può sovrascrivere senza conflitto
cp ~/wrangler.sito.json wrangler.json          # rimetti i tuoi valori
git add wrangler.json
git commit -m "chore: ripristina la configurazione reale del sito"
```

> ⚠️ **Il ripristino non basta:** conserva il blocco `env.staging` esistente e aggiungi
> `"TURNSTILE_SITEKEY": ""` sia alle `vars` di produzione sia a `env.staging.vars`.
> Per ora il valore deve restare vuoto in entrambi gli ambienti; non modificare gli
> altri valori personali.

Le configurazioni personalizzate in `config/*.config.js` vanno migrate durante lo stesso
passaggio. Ora sono il fallback pubblico quando R2 restituisce `NOT_FOUND`: lasciare i
seed neutri del template cambierebbe il contenuto visibile del sito anche se R2 è vuoto.

Il commit che ripristina la configurazione conserva i valori reali, ma non rende
automaticamente il repository divergente: il ramo personale può avere commit propri già
prima di questo passaggio. Nei merge futuri la presenza di commit su entrambi i rami non
garantisce un conflitto su ogni file. Per ogni file, preserva esplicitamente i valori
personali quando il downstream non lo ha modificato dopo la base comune; usa `--ours`
solo dopo aver ispezionato un conflitto reale e aver aggiunto eventuali nuove chiavi
introdotte dal template:

```bash
git checkout --ours wrangler.json && git add wrangler.json    # solo se esiste un conflitto reale
```

Non rilanciare `npm run migrate` dopo il merge, o sovrascriveresti i contenuti reali col
seed vuoto.

**Due cambi di comportamento che questo merge porta con sé**, e che prima non c'erano:

- **Il form di contatto passa da Web3Forms al Worker.** Oggi il sito usa Web3Forms
  (`src/components/ContactForm.js`, `config/site.config.js`); dopo il merge i messaggi
  vengono scritti sul tuo bucket R2 e letti in `/admin`. Perché funzioni davvero serve la
  [voce 9](#9-i-due-secret-del-form-di-contatto): senza `TURNSTILE_SECRET` il form accetta
  comunque tutto, senza `CONTACT_NOTIFY_URL` i messaggi arrivano ma non te lo dice nessuno.
- **`/contatti` diventa `/about`.** I link già condivisi non si rompono: il Worker
  risponde `301` su `/contatti` (`src/worker.js:32`).

La voce 5 è chiusa: dopo il merge e il ripristino, il sito ha superato i gate locali,
il deploy di staging, lo smoke read-only previsto e la promozione fast-forward in
produzione al commit `439725711ba25f6ab4afd0abd9a5e8324c326535`.

```bash
npm test && npm run build && head -2 dist/_headers
```

La riga CSP deve contenere i tuoi URL R2 veri. Se contiene `pub-xxxxxxxx`, il
ripristino di `wrangler.json` è andato storto.

**Fallo su `staging`, non su `main`.** Questo merge non "collega" il sito al template:
porta i commit del template sul repo da cui Cloudflare fa il deploy, quindi il sito
pubblico cambia nel momento in cui pushi. Il branch `staging` viene pubblicato come
version preview del Worker con i binding `env.staging`; non crea automaticamente un
secondo Worker. Il branch ha commit propri rispetto alla base condivisa, quindi il
merge con `upstream/main` è un merge reale. Anche qui `wrangler.json` può essere
sovrascritto senza conflitto se non è cambiato sul ramo personale dopo quella base.

Il giro completo, con `main` toccato solo alla fine e solo per allinearlo a ciò che hai
già visto funzionare:

```bash
git checkout staging && git merge --no-ff upstream/main  # merge reale; ispeziona i conflitti
#   ...ripristino di wrangler.json e commit, come sopra...
git push origin staging                            # Cloudflare deploya lo staging

#   guardi il sito di staging: home, un album, /admin, e il form
#   quando sei convinto:
git checkout main && git merge --ff-only staging   # promuove lo stesso tree verificato
git push origin main
```

In produzione devono finire gli stessi identici byte verificati su `staging`. Se Git
segnala divergenza durante la promozione su `main`, fermati e ispeziona il merge invece
di applicare una risoluzione alla cieca.

---

### 6. ✅ Una deploy key dedicata a `PhotoPortfolio` — verificata il 23 settembre 2026

**Dove:** GitHub → `PhotoPortfolio` → Settings → Deploy keys.

La deploy key dedicata a `PhotoPortfolio` è stata aggiunta con **Allow write access** e
verificata con un'operazione di scrittura sul repository. È distinta dalla chiave usata
per `PhotoPortfolioTemplate`.

La voce 6 è chiusa: non è necessario generare o riutilizzare altre chiavi per il repo
personale.

---

### 7. ✅ `terraform apply`: la configurazione funziona davvero — fatto il 22/09/2026

Lo smoke test isolato è stato eseguito con Terraform 1.16.3 e provider Cloudflare
5.13.0: ha creato tutte e otto le risorse attese, è arrivato a `No changes`, ha
generato `wrangler.json`, ha passato la build di produzione e ha distrutto tutto senza
lasciare residui. Il resoconto sta nel [runbook](runbook-cloudflare.md), sezione 3.5.

**Cosa dimostra e cosa no.** La domanda che contava — *l'API Cloudflare accetta questa
configurazione?* — ha risposta sì, provata. Resta aperta una domanda diversa, che è la
7B qui sotto: *la tua infrastruttura vera va messa sotto Terraform?*

---

### 7B. Decidere se il sito vero passa sotto Terraform

**Dove:** sul tuo computer. Rimandabile senza costi.

La tua infrastruttura di produzione **esiste già** (bucket e applicazioni Access creati
a mano a luglio) e continua a funzionare senza Terraform. Metterla sotto significa
`terraform import` di ogni risorsa esistente — sezione 7 del runbook — non un `apply`.

> ⚠️ **Un `apply` senza `import` creerebbe duplicati.** Il piano proporrebbe di *creare*
> risorse che già esistono, e il sito finirebbe a puntare a quella sbagliata. Se decidi
> di farlo, la regola è: `import` di tutto, poi `plan` finché non dice `No changes`, e
> solo allora `apply`.

**Il pezzo che lo smoke test si è portato via:** creando e distruggendo tutto, il widget
Turnstile del tuo sito non esiste. Finché non fai la 7B, crealo a mano — è la
[voce 9](#9-i-due-secret-del-form-di-contatto).

**Fatto quando:** `terraform plan` sulla tua infrastruttura vera risponde `No changes`.

---

### 7C. Verificare e progettare il bootstrap iniziale di staging

Per il sito esistente di Davide non blocca nulla: il workflow con `env.staging` completo
è stato verificato. Resta però da progettare e provare il primo setup per un nuovo
adopter. La preview generata deve esistere prima di poter creare l'applicazione Access,
mentre il comando completo `npx wrangler versions upload --env staging --name {worker-name} --preview-alias staging`
richiede già un blocco `env.staging` completo, incluso `ACCESS_AUD` ricavato da Access.
`--env staging` seleziona quei binding, ma senza `--name {worker-name}` Wrangler può
targettare il Worker separato indicato da `env.staging.name`. `--preview-alias staging`
pubblica l'URL alias della versione sul Worker top-level. Finché questa dipendenza non ha
una sequenza verificata, non si può descrivere staging come un'opzione turnkey per chi
parte da zero.

---

### 8. Attivare il dominio custom delle foto

Task 4 del [piano del punto 2](superpowers/plans/2026-09-20-punto2-dominio-custom-foto.md).
Richiede la voce 7 e un dominio su una zona Cloudflare.

In sintesi: scegliere il sottodominio (es. `img.tuodominio.com`), riscrivere il
`heroImage` nel tuo `config/site.config.js` nella nuova forma `{ album, name }`,
applicare seguendo i sette passi della sezione 8 del runbook, **verificare
l'anteprima social** condividendo il link in una chat, e solo alla fine spegnere
`r2.dev` con `keep_managed_domain = false`.

La verifica dell'anteprima social non è un vezzo: `og:image` è l'unico percorso che
non si vede navigando il sito, ed è proprio quello che il punto 2 serviva a sistemare.

---

### 9. I due secret del form di contatto

**Dove:** sul tuo computer, dopo la voce 7.

Il form scrive i messaggi su R2 da solo. Protezione Turnstile e notifiche sono
configurazioni opzionali; se le attivi, i loro valori privati vanno **nei secret e non
nelle `vars`**:

```bash
npx wrangler versions secret put TURNSTILE_SECRET      # dal pannello Turnstile
npx wrangler versions secret put CONTACT_NOTIFY_URL    # opzionale: endpoint compatibile con POST di testo
```

Questi comandi devono restare senza `--env staging`: i secret sono configurati sul Worker
top-level e non su un Worker separato nominato dall'ambiente Wrangler.

> **Il widget Turnstile del tuo sito non esiste ancora.** Lo smoke test della voce 7 ha
> creato le otto risorse e poi le ha distrutte, widget compreso. Finché non decidi la
> 7B — se mettere l'infrastruttura vera sotto Terraform — la strada è quella manuale:
> [sezione 5 del runbook, "Turnstile widget"](runbook-cloudflare.md#turnstile-widget).

> ⚠️ **`TURNSTILE_SECRET` e `TURNSTILE_SITEKEY` vanno messi insieme, o non messi affatto.**
> Sono due valori dello stesso widget in due posti diversi, e ogni combinazione a metà
> rompe qualcosa in una direzione opposta.

| sitekey in `wrangler.json` | secret | Cosa succede davvero |
|---|---|---|
| assente o vuota | assente | **sano.** Niente widget, `verifyTurnstile` lascia passare tutto, resta l'honeypot |
| non vuota | presente | **sano.** Protezione attiva |
| non vuota | assente | fallisce **aperto**: il widget appare, ma dietro non valida nessuno |
| assente o vuota | **presente** | fallisce **chiuso**: **403 a ogni invio, per tutti** |

Arrivando dalla voce 5, `TURNSTILE_SITEKEY` deve essere presente ma vuota in entrambi
gli ambienti: finché il widget non esiste, non impostare `TURNSTILE_SECRET`. Senza
sitekey il client non disegna il widget e non manda il token (`src/components/ContactForm.js:32`);
con il secret già configurato il Worker rifiuterebbe ogni invio
(`src/worker/turnstile.js:18`).

Quando avrai creato il widget, sostituisci la `var` vuota in entrambi gli ambienti con la
sitekey reale prima del `secret put`:

```jsonc
// wrangler.json, sia in "vars" sia in "env.staging.vars"
"TURNSTILE_SITEKEY": "0x4AAA..."   // la Site Key del widget
```

oppure rimandi Turnstile del tutto e fai **solo** `CONTACT_NOTIFY_URL`: è la prima riga
della tabella, una configurazione legittima in cui il form funziona e l'honeypot continua
a fermare i bot più ingenui.

Produzione e l'URL della versione staging appartengono allo stesso Worker. Configura i
secret su quel Worker con i comandi sopra e carica la versione con:

```bash
npx wrangler versions upload --env staging --name {worker-name} --preview-alias staging
```

Qui `--env staging` seleziona i binding di staging, `--name {worker-name}` forza il
Worker top-level anche se `env.staging.name` contiene `{project-name}-staging`, e
`--preview-alias staging` crea l'alias URL della version preview. Non omettere `--name` e
non usare `{project-name}-staging` come target: indicherebbe un Worker diverso. Un Worker
Wrangler deliberatamente separato deve gestire i propri secret ed è fuori dal workflow
verificato.

> ⚠️ **Non metterli in `wrangler.json`**, che è versionato: un URL Telegram contiene il
> token del bot, e finirebbe su GitHub.

Per le notifiche, [ntfy.sh](https://ntfy.sh/) accetta il POST di testo del Worker, ma
**non considerarlo affidabile senza un test dal Worker stesso**: sul servizio ospitato
può rispondere HTTP 429 anche quando una `curl` dal Mac funziona. Il topic deve essere
**lungo e casuale**. Telegram, Discord e Slack richiedono invece un adattatore dedicato:
non basta inserire il loro URL in `CONTACT_NOTIFY_URL`. Dettagli e procedura nella
[sezione 9 del runbook](runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection).

**Fatto quando:** staging e produzione accettano ciascuna un invio neutro protetto da
Turnstile e lo salvano in `/admin`. Se configuri `CONTACT_NOTIFY_URL`, verifica anche
che la notifica arrivi davvero dall'invio del form in entrambi gli ambienti. Il 200 del
form conferma il salvataggio, non la consegna del push; se manca, controlla i log del
Worker per `notification failed: HTTP <status>` o `notification failed: request error`.

**E la verifica che nessun test può fare al posto tuo:** se attivi le notifiche,
controlla che quella ricevuta **non contenga il testo del messaggio**. C'è un test
automatico che lo garantisce, ma questa è l'unica prova sul canale reale.

---

### 10. Gli screenshot

**Dove:** tre immagini in `docs/`, e quattro punti da aggiornare.

Servono: la **home**, una **vista album** con la lightbox, e la **dashboard** di
caricamento. Falle a finestra larga e con foto vere — uno screenshot col seed vuoto
racconta il contrario di quello che vuoi dire.

Poi vanno inserite in quattro punti: l'immagine in testa e la sezione Screenshot, in
`README.md` e `README.it.md`. I segnaposto sono già lì, marcati `TODO` e *(coming soon)*.

**Perché pesa più delle altre voci di questo gruppo:** un portfolio fotografico si
giudica guardandolo. Finché mancano, i due README descrivono a parole una cosa che si
capisce in un secondo vedendola.

Mandami i file e li inserisco io.

---

### 11. Il link alla demo

**Dove:** in testa a entrambi i README, riga `🔗 Live demo`.

È il tuo sito, quando sarà online sul dominio definitivo. Un template che mostra un
esempio funzionante convince più di qualsiasi elenco di funzionalità.

---

### 12. Guardare le tre varianti di card

**Dove:** `npm run dev`, e una riga da cambiare in `theme/card.css`.

È il Task 5 del punto 4, e nessun test può sostituirlo: **nessun test dice se una card
è bella.**

Attiva una variante alla volta — `cinematic`, `editorial`, `minimal` — commentando e
decommentando le `@import`. Il dev server ricarica da solo. Guardale anche da telefono:
`editorial` passa a colonna singola sotto i 600px, `minimal` diventa molto alta perché
conserva le proporzioni originali delle foto.

Poi decidi **quale resta il default del template**. Ora è `cinematic` perché era
l'aspetto già esistente, non perché qualcuno l'abbia scelta.

Se una non convince, dimmelo: sono tre file CSS indipendenti, si correggono o si
eliminano senza toccare altro.

---

## Decisioni ancora aperte

Non sono azioni da fare, ma scelte che prima o poi vanno prese. Le prime tre servono a
lavori già pianificati; le ultime due sono stonature note di cui hai il diritto di
decidere che non ti importano.

- **Nome del repo template** una volta pubblico. `PhotoPortfolioTemplate` va bene, ma è
  il momento buono per cambiarlo: dopo, gli URL nel README e nei fork sarebbero da
  aggiornare.
- **Quale dominio** per le foto (`img.tuodominio.it` o simile) e su quale zona
  Cloudflare. Serve alla voce 8.
- **Stato Terraform**: locale, come raccomandato, oppure backend su R2. Serve alla
  voce 7; in assenza di indicazioni si procede con quello locale.
- **I commenti nel codice sono in italiano.** In un template rivolto a sviluppatori
  internazionali è una stonatura vera, ma tradurli tutti significa toccare codice
  funzionante per una ragione estetica. Se si fa, è un punto a sé con revisione seria.

---

## Decise, e chiuse

- **Niente link di donazione, per ora** (21 settembre 2026). Un progetto senza
  utenti e senza costi ricorrenti che elenca tre modi per donare dice di sé qualcosa
  che non è ancora vero. In questa fase il segnale utile non sono i soldi: sono una
  stella, una segnalazione, e qualcuno che racconta cosa ci ha costruito. La sezione
  del README chiede quelli. Rimessi i link, se mai servirà, sono cinque minuti:
  `.github/FUNDING.yml` è stato rimosso e va ricreato.
- **URL pubblico `/about`** (21 settembre 2026). `/contatti` resta un redirect 301
  per i collegamenti esistenti; navigazione, testi e test usano `/about`.
- **`/contatti` rimosso** (26 settembre 2026, F3). Il redirect 301 verso `/about` non c'è più: `/contatti` è un indirizzo di album come gli altri.

---

## Fatte

- **Voce 1 — PR del bootstrap**, mergiata il 2026-09-20. Ha richiesto una
  seconda PR perché la prima era stata unita con uno squash, che aveva
  scartato la parentela git col sito.
- **Voce 2 — documentazione pronta alla pubblicazione** (21 settembre 2026).
  I riferimenti personali a domini, bucket, team Access, email, repository del sito
  e sessioni di lavoro sono stati sostituiti da segnaposto; la storia tecnica resta
  nel template. Il repository del template resta l'upstream canonico dei fork.
- **Voce 3 — repository pubblico** (21 settembre 2026). Completata da Davide;
  il template può ora essere forkato da altri account GitHub.
- **Voce 4 — opzione Template repository disattivata** (21 settembre 2026).
  Completata da Davide: il flusso presentato da GitHub resta il fork, che conserva
  la parentela necessaria per ricevere aggiornamenti dall'upstream.

---
