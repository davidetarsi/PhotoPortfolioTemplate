# Bootstrap della storia comune — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare ai due repo un antenato git comune, portare l'architettura attuale del sito dentro `PhotoPortfolioTemplate`, e lasciare il template pronto a diventare pubblico e upstream.

**Architecture:** Un solo merge `--allow-unrelated-histories` nel template crea l'antenato comune; l'albero risultante è reso identico a quello del sito con `git read-tree`, così il merge è deterministico invece di essere una lunga risoluzione di conflitti a mano. Due commit successivi neutralizzano i valori personali e documentano il flusso fork/merge. Il sito viene poi agganciato al template come downstream.

**Tech Stack:** git, Node 20+, npm, vitest, wrangler (solo per validare la configurazione, nessun deploy).

**Spec:** [docs/superpowers/specs/2026-09-20-template-distribuibile-analisi.md](../specs/2026-09-20-template-distribuibile-analisi.md) — punto 0 di §7, decisioni §8.1 e §8.2.

## Global Constraints

Dal `CLAUDE.md` di `/srv/claude/workspaces/`, vincolanti per ogni task:

- **Mai `git push --force`** in nessuna forma (`-f`, `--force-with-lease`, refspec con `+`).
- **Mai cancellare rami remoti** (`git push --delete`, `git push origin :ramo`).
- **Mai `--no-verify`.** Se un push viene bloccato: fermarsi e segnalare, **non** cercare una strada alternativa.
- **Mai committare direttamente su `main`.** Branch dedicato e PR; chi decide se unire è una persona.
- Si lavora solo dentro `/srv/claude/workspaces/`.
- Ogni file cancellato va dichiarato, con il motivo.
- **Non leggere, copiare o stampare credenziali.** Vincolo con effetti diretti sul Task 1: le ricerche di segreti riportano **percorso e conteggio, mai il valore trovato**.
- Identità commit: `VPS Agent <agent@vps-agent.invalid>`, già globale, da non cambiare.

Ogni commit termina con:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

**Stato noto all'inizio:** la chiave SSH di questa VPS ha accesso in **sola lettura** a `your-github-user/your-portfolio` (push rifiutato il 2026-09-20). Il Task 1 verifica i permessi su `PhotoPortfolioTemplate` prima che qualunque lavoro ci si appoggi sopra.

---

## File Structure

Repo di lavoro: `/srv/claude/workspaces/PhotoPortfolioTemplate` (tutti i task tranne il 6).

| File | Responsabilità dopo il bootstrap |
|---|---|
| `wrangler.json` | **rimosso dal tracking**, generato da esempio; contiene i valori reali di chi installa |
| `wrangler.example.json` | tracciato; segnaposto documentati, unica fonte per chi configura |
| `.gitignore` | aggiunge `wrangler.json` |
| `config/site.config.js` | seed neutro: nome/bio segnaposto |
| `config/albums.config.js` | seed neutro: un album di esempio |
| `README.md` | aggiunge la sezione "Fork e aggiornamenti" |
| `docs/superpowers/` | arriva dal sito col merge, sostituisce i documenti di luglio |

Il resto dell'albero arriva dal sito senza modifiche.

---

### Task 1: Verifiche preliminari — permessi e igiene della storia

Nessuna modifica: è il cancello che decide se il resto del piano può partire. Produce un verdetto scritto.

**Files:**
- Create: `/tmp/claude-1001/-srv-claude-workspaces/*/scratchpad/bootstrap-preflight.md` (referto, fuori dai repo)

**Interfaces:**
- Consumes: niente
- Produces: verdetto GO / NO-GO usato dal Task 2; elenco dei file da neutralizzare usato dal Task 4

- [ ] **Step 1: Verificare l'accesso in scrittura al repo template**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git push --dry-run origin HEAD:refs/heads/preflight-check-accesso
```

Atteso: `Everything up-to-date` o l'elenco di ciò che verrebbe creato, **senza** `denied to deploy key`.
Se compare `denied`: **fermarsi e segnalare**. Il piano non può proseguire e la chiave va abilitata in scrittura da GitHub → Settings → Deploy keys. Non tentare altre vie.

- [ ] **Step 2: Verificare che nessun file di ambiente sia mai stato committato nel sito**

```bash
cd /srv/claude/workspaces/photoportfolio
git log --all --diff-filter=A --pretty=format: --name-only \
  | sort -u | grep -viE '^$' \
  | grep -iE '(^|/)\.env($|\.)|\.pem$|\.key$|id_rsa|credential|secret' || echo "PULITO"
```

Atteso: `PULITO`. Qualsiasi percorso elencato è un file da valutare **prima** di rendere pubblico il repo.

- [ ] **Step 3: Cercare segreti nel contenuto della storia, senza stamparne il valore**

```bash
cd /srv/claude/workspaces/photoportfolio
git grep -I -l -E 'BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20}|github_pat_|AKIA[0-9A-Z]{16}' \
  $(git rev-list --all) -- . 2>/dev/null | sort -u | head -20 || true
echo "--- fine elenco (vuoto = nessuna corrispondenza) ---"
```

Nota: `-l` stampa **solo** i percorsi, mai la riga trovata. È deliberato e non va cambiato in `-n`: il vincolo globale vieta di stampare credenziali.
Atteso: elenco vuoto.

- [ ] **Step 4: Censire i valori personali da neutralizzare**

```bash
cd /srv/claude/workspaces/photoportfolio
git grep -l -E 'your-github-user|cloudflareaccess\.com|pub-[0-9a-f]{32}\.r2\.dev' -- \
  . ':!node_modules' ':!package-lock.json' ':!docs' | sort -u
```

Atteso: un elenco breve, che deve contenere almeno `wrangler.json`, `config/site.config.js`, `config/albums.config.js`. Questo elenco è l'input del Task 4: se compaiono file non previsti da `File Structure`, il Task 4 va esteso prima di eseguirlo.

- [ ] **Step 5: Scrivere il referto**

Creare `bootstrap-preflight.md` nello scratchpad con: esito di ogni step, elenco dei file del passo 4, e una riga finale `VERDETTO: GO` oppure `VERDETTO: NO-GO — <motivo>`.

- [ ] **Step 6: Cancello**

Se il verdetto è NO-GO, fermarsi e riferire. Nessun commit in questo task: non ha modificato nulla nei repo.

---

### Task 2: Stabilire l'antenato comune

**Files:**
- Modify: tutto l'albero di `/srv/claude/workspaces/PhotoPortfolioTemplate` sul branch `bootstrap-architettura-r2`

**Interfaces:**
- Consumes: verdetto GO dal Task 1
- Produces: un commit di merge con due genitori; da qui `git merge-base` tra i due repo restituisce un commit

- [ ] **Step 1: Verificare che oggi l'antenato comune NON esista**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git remote add sito /srv/claude/workspaces/photoportfolio 2>/dev/null || true
git fetch sito
git merge-base main sito/staging && echo "INATTESO: esiste già" || echo "OK: nessun antenato comune"
```

Atteso: `OK: nessun antenato comune`. È il "test che fallisce" di questo task.

- [ ] **Step 2: Creare il branch di lavoro**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git checkout main
git checkout -b bootstrap-architettura-r2
```

- [ ] **Step 3: Avviare il merge senza committare**

```bash
git merge --allow-unrelated-histories --no-commit sito/staging || true
```

Il `|| true` è atteso: con storie non imparentate ogni file presente in entrambi i repo entra in conflitto. Non si risolvono a mano — ci pensa il passo successivo.

- [ ] **Step 4: Rendere l'albero identico a quello del sito**

```bash
git read-tree -u --reset sito/staging
```

Questo azzera indice e working tree sull'albero del sito conservando `MERGE_HEAD`, così il commit successivo avrà **due genitori** ma il contenuto esatto del sito. Risolve in un colpo sia i conflitti sia i file della vecchia era Drive presenti solo nel template.

- [ ] **Step 5: Verificare che l'albero coincida**

```bash
git diff sito/staging --stat
echo "--- atteso: nessun output sopra ---"
git diff main --stat | tail -1
```

Atteso: il primo comando non stampa nulla; il secondo mostra molte righe cambiate rispetto a `main`.

- [ ] **Step 6: Elencare i file che il merge rimuove, per poterli dichiarare**

```bash
git diff main --diff-filter=D --name-only
```

Sono i file che esistevano solo nel template: architettura Google Drive e documenti di luglio superati. L'elenco va copiato nel messaggio di commit.

- [ ] **Step 7: Creare il commit di merge**

```bash
git commit -F - <<'EOF'
chore: adotta l'architettura R2 del sito e crea l'antenato comune

Merge con --allow-unrelated-histories da your-github-user/your-portfolio
(branch staging). L'albero risultante e identico a quello del sito:
il template era fermo all'8 luglio su architettura Google Drive, che
non esiste piu.

Da questo commit i due repo condividono storia, quindi gli
aggiornamenti futuri viaggiano con un merge ordinario. Questa e la
precondizione del punto 0 della spec.

File rimossi perche appartenenti all'era Google Drive o superati:
<incollare qui l'elenco dello Step 6>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8: Verificare che ora l'antenato comune esista**

```bash
git merge-base HEAD sito/staging && echo "OK: antenato comune creato"
git log -1 --format='%h genitori: %p'
```

Atteso: un hash, `OK: antenato comune creato`, e due hash di genitori.

---

### Task 3: Verificare che il template stia in piedi

Il merge ha portato codice che nel template non è mai girato. Prima di toccare altro, si accerta che compili e passi i test.

**Files:**
- Nessuna modifica prevista; se i test falliscono, il piano si ferma.

**Interfaces:**
- Consumes: il commit di merge del Task 2
- Produces: conferma che i 268 test passano anche qui

- [ ] **Step 1: Installare le dipendenze**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
npm ci
```

- [ ] **Step 2: Eseguire i test**

```bash
npm test
```

Atteso: tutti i test passano. Il numero atteso è **264** (verificato con `npm test` il 2026-09-20); se ne passano meno, il merge ha perso qualcosa e va indagato prima di proseguire.

- [ ] **Step 3: Eseguire la build**

```bash
npm run build
```

Atteso: build completata, `dist/` popolata con `index.html`, `album.html`, `contatti.html`, `admin.html`.

- [ ] **Step 4: Nessun commit**

Task di sola verifica. Se qualcosa fallisce: fermarsi e riferire, non aggiustare a caso.

---

### Task 4: Neutralizzare i valori personali

Separa ciò che è configurazione di chi installa da ciò che è codice del template. Serve sia per la pubblicazione, sia per ridurre i conflitti nei merge futuri verso il sito.

**Files:**
- Create: `wrangler.example.json`
- Modify: `.gitignore`, `config/site.config.js`, `config/albums.config.js`
- Delete (dal tracking, non dal disco): `wrangler.json`

**Interfaces:**
- Consumes: l'elenco file dello Step 4 del Task 1
- Produces: un albero senza dati personali, pronto per un repo pubblico

- [ ] **Step 1: Verificare che oggi i valori personali ci siano**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git grep -c -E 'your-github-user|cloudflareaccess\.com|pub-[0-9a-f]{32}\.r2\.dev' -- \
  wrangler.json config/site.config.js config/albums.config.js
```

Atteso: conteggi maggiori di zero. È il "test che fallisce".

- [ ] **Step 2: Creare l'esempio di wrangler**

```bash
cp wrangler.json wrangler.example.json
```

Poi sostituire in `wrangler.example.json` ogni valore personale con un segnaposto parlante:

| Campo | Valore segnaposto |
|---|---|
| `name` | `"il-tuo-portfolio"` |
| `r2_buckets[].bucket_name` | `"il-tuo-bucket"` |
| `vars.ACCESS_TEAM_DOMAIN` | `"il-tuo-team.cloudflareaccess.com"` |
| `vars.ACCESS_AUD` | `"incolla-qui-l-aud-della-tua-Access-application"` |
| `vars.R2_PUBLIC_URL` | `"https://pub-xxxxxxxx.r2.dev"` |

Gli stessi cinque campi vanno sostituiti anche nel blocco `env.staging`.

- [ ] **Step 3: Togliere il wrangler reale dal tracking**

```bash
git rm --cached wrangler.json
printf '\n# Configurazione locale, si genera da wrangler.example.json\nwrangler.json\n' >> .gitignore
```

`git rm --cached` toglie il file dall'indice **lasciandolo sul disco**: chi ha già il repo continua a lavorare senza interruzioni.

- [ ] **Step 4: Neutralizzare il seed dei contenuti**

In `config/site.config.js`: `name` → `'Nome Fotografo'`, `bio` → `'Una breve descrizione del fotografo.'`, `social` → oggetto vuoto con un commento di esempio, `heroImageUrl` → `''`.

In `config/albums.config.js`: sostituire gli album reali con un unico album di esempio:

```js
export const albums = [
  {
    slug: 'nome-album',
    title: 'Titolo Album',
    description: 'Descrizione breve dell\'album.',
    cover: '',
  },
];
```

- [ ] **Step 5: Verificare che i valori personali siano spariti dall'albero tracciato**

```bash
git grep -l -E 'your-github-user|cloudflareaccess\.com|pub-[0-9a-f]{32}\.r2\.dev' -- \
  . ':!node_modules' ':!package-lock.json' ':!docs' || echo "PULITO"
```

Atteso: `PULITO`.
Nota: `docs/` è escluso di proposito — la spec e questo piano citano i valori reali come evidenza, ed è materiale che resta. Se il repo diventa pubblico questa scelta va riconsiderata: è uno dei punti del Task 7.

- [ ] **Step 6: Verificare che i test reggano la config neutra**

```bash
npm test
```

Atteso: tutti i test passano. Se qualcuno dipendeva dai dati personali, va corretto qui.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -F - <<'EOF'
chore: neutralizza i valori personali per la distribuzione

wrangler.json esce dal tracking e viene sostituito da
wrangler.example.json con segnaposto documentati: e configurazione di
chi installa, non codice del template, e tenerlo fuori evita che ogni
merge verso un sito reale entri in conflitto sui suoi valori.

config/ torna al seed neutro. Ricordare che config/ e solo il seed
iniziale: a runtime la verita e su R2 (spec, sezione 4.2).

wrangler.json resta sul disco, rimosso solo dall'indice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Documentare il flusso fork e aggiornamenti

Senza questo, la decisione §8.1 resta una buona intenzione: chi arriva sul repo userà comunque "Use this template" e perderà la possibilità di aggiornarsi.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: il template neutralizzato del Task 4
- Produces: le istruzioni che i cloni useranno per aggiornarsi

- [ ] **Step 1: Verificare che il README non ne parli**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
grep -iE 'fork|upstream' README.md || echo "ASSENTE, da aggiungere"
```

Atteso: `ASSENTE, da aggiungere`.

- [ ] **Step 2: Aggiungere la sezione, subito dopo il titolo**

````markdown
## Come partire, e come restare aggiornati

**Fai un fork**, non usare "Use this template". Il fork conserva la storia git,
e solo così potrai ricevere le migliorie future con un merge. "Use this
template" crea un repo senza antenati comuni: comodo il primo giorno,
definitivo per sempre.

Dopo il fork:

```bash
git clone git@github.com:TUO-UTENTE/TUO-REPO.git
cd TUO-REPO
git remote add upstream git@github.com:davidetarsi/PhotoPortfolioTemplate.git
cp wrangler.example.json wrangler.json   # poi compila i tuoi valori
npm install
```

Per ricevere gli aggiornamenti, quando vuoi:

```bash
git fetch upstream
git merge upstream/main
```

I conflitti, se ci sono, cadranno su `config/` e `theme/` — cioè su ciò che hai
personalizzato tu. Tieni le tue modifiche dentro quelle cartelle e gli
aggiornamenti resteranno indolori.

> Preferisci un repo privato e slegato dal fork? Allora `git clone` di questo
> repo, poi ripunta `origin` sul tuo e aggiungi `upstream` come sopra: il
> risultato per gli aggiornamenti è identico.
````

- [ ] **Step 3: Verificare**

```bash
grep -iE 'fork|upstream' README.md | head -3
```

Atteso: righe trovate.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -F - <<'EOF'
docs: spiega il flusso fork e come ricevere gli aggiornamenti

"Use this template" crea un repo senza antenati comuni: e esattamente
come questo template e rimasto indietro di un'architettura intera
rispetto al sito. Chi parte da qui deve forkare, o clonare e ripuntare
origin, per poter fare git merge upstream/main in futuro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Agganciare il sito come downstream

**Files:**
- Modify: configurazione git di `/srv/claude/workspaces/photoportfolio` (nessun file versionato)

**Interfaces:**
- Consumes: il branch `bootstrap-architettura-r2` del template
- Produces: `upstream` configurato nel sito, e la prova che il merge futuro è possibile

- [ ] **Step 1: Aggiungere il remote upstream**

```bash
cd /srv/claude/workspaces/photoportfolio
git remote add upstream git@github.com-photoportfolio:davidetarsi/PhotoPortfolioTemplate.git 2>/dev/null || true
git remote -v | grep upstream
```

- [ ] **Step 2: Verificare che l'antenato comune sia visibile anche da qui**

```bash
git fetch /srv/claude/workspaces/PhotoPortfolioTemplate bootstrap-architettura-r2
git merge-base HEAD FETCH_HEAD && echo "OK: i due repo sono imparentati"
```

Atteso: un hash e `OK: i due repo sono imparentati`. È la verifica che l'intero piano ha raggiunto il suo scopo.

- [ ] **Step 3: Provare il merge a vuoto, senza applicarlo**

```bash
git merge --no-commit --no-ff FETCH_HEAD || true
git diff --cached --stat | tail -5
git merge --abort 2>/dev/null || git reset --hard HEAD
git status -sb | head -2
```

Atteso: il merge parte (non più "unrelated histories"), e dopo l'abort il working tree è pulito. Serve a vedere **in anticipo** quali file entreranno in conflitto quando il sito accoglierà il template: verosimilmente `wrangler.json`, `config/`, `README.md`.

- [ ] **Step 4: Annotare l'esito**

Riportare nel referto dello scratchpad quali file sarebbero entrati in conflitto. È l'informazione che serve a decidere, in un piano successivo, quanto ridurre la superficie personale del sito.

---

### Task 7: Consegna alla persona

Le azioni che restano non sono eseguibili da un agente, per vincolo o per buon senso.

- [ ] **Step 1: Pushare il branch e aprire la PR**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git push -u origin bootstrap-architettura-r2
```

Poi aprire una PR verso `main` su GitHub. **Il merge lo decide una persona**, come da vincoli globali. Se il push viene rifiutato: fermarsi e segnalare.

- [ ] **Step 2: Decidere cosa fare di `docs/` prima della pubblicazione**

La spec e questo piano citano nome del team Access, AUD e URL R2 reali. Non sono credenziali — l'AUD è un identificativo pubblico e gli URL `r2.dev` sono già raggiungibili da chiunque — ma sono dati che legano il repo pubblico al tuo account. Tre vie: lasciarli, sostituirli con segnaposto anche nei documenti, oppure tenere `docs/superpowers/` fuori dal template. **Decisione della persona.**

- [ ] **Step 3: Rendere pubblico il repo template**

GitHub → `PhotoPortfolioTemplate` → Settings → Danger Zone → Change visibility.
Solo dopo che lo Step 2 è stato deciso e applicato: rendere pubblico è un'azione che non si annulla davvero, perché ciò che è stato visto resta visto.

- [ ] **Step 4: Disattivare "Template repository"**

Nelle impostazioni del repo, togliere la spunta *Template repository*: finché è attiva, GitHub mostra il bottone "Use this template" e invoglia proprio la strada che abbiamo deciso di non far prendere a nessuno.

- [ ] **Step 5: Archiviare o segnalare lo stato del vecchio contenuto**

Il template non ha più il codice Google Drive. Se qualcuno ci fosse arrivato in passato, un avviso in cima al README del branch vecchio è cortesia. Opzionale, decide la persona.

---

## Self-Review

**Copertura della spec.** Il punto 0 di §7 è coperto dai Task 2 e 6 (antenato comune, template promosso a upstream). Le conseguenze di §8.1 sono coperte così: repo pubblico → Task 7 Step 3, preceduto dal controllo del Task 1; superficie personale del sito → Task 6 Step 3, che la misura invece di supporla; documentazione che si sposta nel template → conseguenza del Task 2, visto che `docs/` arriva col merge.

**Segnaposto.** Nessun TBD. L'unico contenuto non scritto per esteso è l'elenco dei file rimossi nel messaggio di commit del Task 2 Step 7, che per natura si ottiene solo eseguendo lo Step 6 immediatamente precedente.

**Coerenza dei nomi.** Branch `bootstrap-architettura-r2` in tutti i task. Remote `sito` (nel template, Task 2) e `upstream` (nel sito, Task 6): nomi diversi perché puntano in direzioni opposte, ed è voluto. File `wrangler.example.json` e `wrangler.json` usati con la stessa grafia nei Task 4, 5 e 6.

**Un limite dichiarato.** Il Task 4 Step 5 esclude `docs/` dal controllo dei dati personali, e il Task 7 Step 2 chiede di decidere cosa farne. È una consegna voluta, non una dimenticanza: la scelta ha conseguenze che spettano alla persona.

---

## Esito dell'esecuzione — 2026-09-20

Task 1–6 eseguiti. Task 7 in attesa della persona.

**Scostamenti dal piano, tutti deliberati:**

1. **Mergiato `analisi-template-distribuibile` invece di `staging`.** Contiene staging per intero più quattro commit di documentazione non pushabili su `photoportfolio`, dove la chiave di questa VPS ha accesso in sola lettura. Mergiare `staging` li avrebbe lasciati irraggiungibili.
2. **Il Task 4 riguardava 6 file, non 3.** Il censimento ha trovato anche `config/admin.config.js`, `.env.example` (nome reale del bucket) e `public/_headers`. I due file di test e `package.json` erano falsi positivi: usano già fixture finte e un nome generico.
3. **`public/_headers` neutralizzato subito**, anche se il piano proponeva di rimandarlo al punto 1. Lasciare gli URL reali avrebbe dato a ogni fork una CSP che punta al bucket di qualcun altro, bloccandogli le foto senza spiegare perché.
4. **Il numero atteso dei test era sbagliato**: 264, non 268. Il 268 veniva da un conteggio `grep` che includeva quattro occorrenze di `makeJwtTestKit(`.
5. **Aggiunto un avviso nel README** sopra la checklist di setup, che descrive ancora l'architettura Google Drive. Non era nel piano, ma il repo è destinato a diventare pubblico.

### Il primo merge sito ← template richiede cautela

La prova a vuoto del Task 6 dà `Automatic merge went well`, zero conflitti. Va letto al contrario di come sembra: il merge è pulito perché il sito **non è divergente**, quindi non negozia nulla e accetta in blocco ciò che il template ha cambiato.

| Cosa cambierebbe nel sito | Gravità |
|---|---|
| `config/*` torna al seed neutro | innocuo — a runtime la verità è su R2 (spec §4.2). Ma non rilanciare `npm run migrate` dopo, o si sovrascrive R2 col seed vuoto |
| `wrangler.json` **cancellato dal disco** (nel template è stato rimosso dal tracking) | serio — contiene bucket, team Access e AUD reali |
| `public/_headers` prende i segnaposto | serio — romperebbe la CSP in produzione |

Procedura per il primo merge:

```bash
cd photoportfolio
cp wrangler.json /tmp/wrangler.json.bak
cp public/_headers /tmp/_headers.bak
git fetch upstream && git merge upstream/main
cp /tmp/wrangler.json.bak wrangler.json        # ora non più versionato
cp /tmp/_headers.bak public/_headers           # finché non è generato a build time
```

Dal secondo merge in poi il problema sparisce per `wrangler.json`, che resta ignorato da git. Resta per `public/_headers` finché il punto 1 della spec non lo farà generare dalla configurazione.
