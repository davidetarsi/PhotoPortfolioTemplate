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

### 🔧 Infrastruttura — nulla di tutto questo è mai stato provato contro l'API vera

| # | Azione | Blocca |
|---|---|---|
| **7** | **`terraform apply`: creare l'infrastruttura** | la verifica dei punti 1, 2 e del form |
| 8 | Dominio custom per le foto | niente d'altro, ma `r2.dev` è rate-limited |
| 9 | I due secret del form: `TURNSTILE_SECRET` e `CONTACT_NOTIFY_URL` | la protezione antispam e le notifiche |

### 📢 Pubblicazione — la strada per darlo agli amici

| # | Azione | Blocca |
|---|---|---|
| 2 | Decidere cosa fare di `docs/` | la pubblicazione |
| 3 | Rendere pubblico il repo | la condivisione con gli amici |

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
| 5 | Primo merge sito ← template | niente |
| 6 | Deploy key in scrittura su `photoportfolio` | niente, opzionale |

**Nessuna blocca la scrittura di altro codice**, ma la voce 7 è diversa dalle altre:
finché non viene eseguita, tutto ciò che abbiamo costruito su Cloudflare — bucket,
Access, dominio custom, Turnstile — è **scritto e validato ma mai provato contro
l'API vera**. Ogni lavoro aggiunto sopra allunga ciò che si scoprirebbe tutto insieme
al primo `apply`.

---

### 2. Decidere cosa fare di `docs/` prima della pubblicazione

**Il fatto:** i documenti in `docs/superpowers/` citano il nome del tuo team Access,
gli identificativi AUD delle due applicazioni Access e gli URL pubblici dei tuoi due
bucket R2.

**Non sono credenziali.** L'AUD è un identificativo pubblico e gli URL `r2.dev` sono
endpoint già raggiungibili da chiunque. Nessuno di questi valori permette di fare
qualcosa che non si potrebbe fare senza. Ma legano in modo permanente un repo
pubblico al tuo account Cloudflare, e finiscono nei motori di ricerca.

**Tre vie:**

- **Lasciarli.** Zero lavoro. I documenti restano leggibili come storia del progetto,
  che è parte del valore per chi clona.
- **Sostituirli con segnaposto anche nei documenti.** Mezz'ora. I documenti perdono
  un po' di concretezza (le spiegazioni citano valori veri come evidenza) ma restano
  comprensibili.
- **Tenere `docs/superpowers/` fuori dal template.** I documenti restano solo nel tuo
  repo privato. Il template perde la sua storia progettuale, che per un pubblico di
  sviluppatori è probabilmente la parte più interessante.

**Da decidere prima del punto 3**, perché rendere pubblico non si annulla: ciò che è
stato visto resta visto.

---

### 3. Rendere pubblico il repo template

**Dove:** GitHub → `PhotoPortfolioTemplate` → Settings → Danger Zone → Change visibility.

**Perché serve:** un repo privato non si può forkare da fuori il tuo account. Senza
questo, la decisione "si entra col fork" non funziona per nessuno dei tuoi amici.

**Prerequisito:** il punto 2 deciso e applicato.

**Fatto quando:** il repo è raggiungibile da un browser in incognito.

---

### 5. Primo merge sito ← template, con precauzioni

**Dove:** sul tuo computer, nel repo `photoportfolio`.

Il merge non è pericoloso come sembrava in una versione precedente di questo
documento, ma due file vanno guardati a mano.

```bash
cd photoportfolio
git remote add upstream git@github.com:davidetarsi/PhotoPortfolioTemplate.git
git fetch upstream && git merge upstream/main
```

**`wrangler.json` andrà in conflitto**, ed è voluto: il template porta i segnaposto,
tu hai i tuoi valori reali. Risolvi **tenendo la tua versione**:

```bash
git checkout --ours wrangler.json && git add wrangler.json
```

**`public/_headers` viene eliminato**, ed è giusto: dal punto 1 la CSP si genera a
build time da `wrangler.json`. Non ripristinarlo — se resta, Vite lo copierebbe
sopra quello generato, rimettendo in produzione URL fissi.

I file in `config/` torneranno al seed neutro: **è innocuo**, perché a runtime la
verità è su R2. Ma non rilanciare `npm run migrate` dopo, o sovrascriveresti i
contenuti reali col seed vuoto.

Chiudi verificando che il sito regga ancora:

```bash
npm test && npm run build && head -2 dist/_headers
```

La riga CSP deve contenere i tuoi URL R2 veri. Se contiene `pub-xxxxxxxx`, la
risoluzione del conflitto è andata storta.

---

### 6. Accesso in scrittura alla deploy key di `photoportfolio`

**Dove:** GitHub → `photoportfolio` → Settings → Deploy keys → "Allow write access".

**Perché è solo opzionale:** la chiave di questa VPS ha accesso in sola lettura a
`photoportfolio`, e il push dei documenti è stato rifiutato. Ma quei commit sono
comunque arrivati su GitHub passando dal template, di cui sono diventati antenati.
Non si è perso nulla.

Serve solo se in futuro vorrai che il lavoro sul *sito* venga fatto da questa VPS.
Per la decisione presa — il template è upstream, il sito è a valle — non dovrebbe
servire quasi mai.

---

### 7. `terraform apply`: applicare l'infrastruttura

**Dove:** sul tuo computer, non su questa VPS: serve un token API Cloudflare che
l'agente non deve possedere.

È il Task 8 del [piano del punto 1](superpowers/plans/2026-09-20-punto1-terraform-e-configurazione.md).
La procedura completa, con i permessi esatti del token, sta nel
[runbook](runbook-cloudflare.md) sezioni 2 e 3.

**Perché è la più urgente.** `terraform validate` verifica che la configurazione sia
sintatticamente valida e che i nomi dei campi esistano nello schema del provider. Non
verifica che l'API Cloudflare accetti quei valori, che i permessi del token bastino,
che le risorse si creino davvero. Quella prova è solo l'`apply`.

**Attenzione al `plan` prima dell'`apply`:** la tua infrastruttura **esiste già**
(bucket e applicazioni Access create a mano a luglio). Se il piano propone di
**creare** risorse che già esistono, servono gli `import` della sezione 7 del
runbook. Applicare senza guardare produrrebbe risorse duplicate e un sito che punta
a quella sbagliata.

**Fatto quando:** `terraform plan` risponde `No changes`, e `npm run infra:sync`
rigenera un `wrangler.json` con i valori reali.

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

Il form scrive i messaggi su R2 da solo, ma due cose restano da configurare, **entrambe
come secret e non come `vars`**:

```bash
npx wrangler secret put TURNSTILE_SECRET      # dal pannello Turnstile, dopo terraform apply
npx wrangler secret put CONTACT_NOTIFY_URL    # dove vuoi ricevere le notifiche
```

> ⚠️ **Non metterli in `wrangler.json`**, che è versionato: un URL Telegram contiene il
> token del bot, e finirebbe su GitHub.

Per le notifiche la via più rapida è [ntfy.sh](https://ntfy.sh/): nessun account, scegli
un nome di topic **lungo e casuale** e installi l'app. Le tre ricette stanno nella
[sezione 9 del runbook](runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection).

**Fatto quando:** invii un messaggio dal sito vero, arriva la notifica, e lo vedi in `/admin`.

**E la verifica che nessun test può fare al posto tuo:** controlla che la notifica
ricevuta **non contenga il testo del messaggio**. C'è un test automatico che lo
garantisce, ma questa è l'unica prova sul canale reale.

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

Non sono azioni da fare, ma scelte che servono a lavori già pianificati.

- **Nome del repo template** una volta pubblico. `PhotoPortfolioTemplate` va bene, ma è
  il momento buono per cambiarlo: dopo, gli URL nel README e nei fork sarebbero da
  aggiornare.
- **Quale dominio** per le foto (`img.tuodominio.it` o simile) e su quale zona
  Cloudflare. Serve alla voce 8.
- **Stato Terraform**: locale, come raccomandato, oppure backend su R2. Serve alla
  voce 7; in assenza di indicazioni si procede con quello locale.

---

## Decise, e chiuse

- **La rotta `/contatti` è diventata `/about`** (21 settembre 2026), con un redirect
  301 dal vecchio indirizzo perché i link già condivisi continuino a funzionare. Il
  nome descrive la pagina che sarà, una volta fusa con la presentazione.
- **I commenti del codice sono in inglese** (21 settembre 2026), insieme al JSDoc su
  tutte le funzioni esportate. La convenzione che li governa sta in `CONTRIBUTING.md`,
  compreso l'elenco dei commenti che non vanno mai rimossi.
- **Le stringhe di diagnostica sono in inglese** (21 settembre 2026): errori, output
  dei comandi e la notifica che arriva sul telefono. Il copy del sito in
  `config/texts.config.js` resta in italiano: è una decisione a parte, ancora aperta.
- **Niente link di donazione, per ora** (21 settembre 2026). Un progetto senza
  utenti e senza costi ricorrenti che elenca tre modi per donare dice di sé qualcosa
  che non è ancora vero. In questa fase il segnale utile non sono i soldi: sono una
  stella, una segnalazione, e qualcuno che racconta cosa ci ha costruito. La sezione
  del README chiede quelli. Rimessi i link, se mai servirà, sono cinque minuti:
  `.github/FUNDING.yml` è stato rimosso e va ricreato.

---

## Fatte

- **Voce 4 — spunta "Template repository" tolta**, 21 settembre 2026. Il repo non
  mostra più il bottone verde "Use this template", che creava repo senza antenati
  comuni e incapaci di ricevere aggiornamenti. Ora l'unica via d'ingresso visibile è
  il fork, che è quella giusta.
- **Voce 1 — PR del bootstrap**, mergiata il 2026-09-20. Ha richiesto una
  seconda PR perché la prima era stata unita con uno squash, che aveva
  scartato la parentela git col sito.

---
