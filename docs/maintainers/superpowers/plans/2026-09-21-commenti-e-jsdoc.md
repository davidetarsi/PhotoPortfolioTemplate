# Commenti e JSDoc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare il codice allo standard di un progetto mantenuto bene — contratto documentato su ogni funzione esportata, commenti in inglese, e nessun commento che ripeta il codice — **senza perdere i commenti che spiegano il perché**, che sono la memoria delle decisioni prese.

**Architecture:** Nessuna riga di codice cambia. Si scrive prima la convenzione in `CONTRIBUTING.md`, così il resto del lavoro ha una regola da seguire e non un gusto; poi si procede per aree, dal nucleo puro alla dashboard. A fine di ogni task una rete di sicurezza meccanica dimostra che è cambiato solo il commento: l'impronta del bundle prodotto dalla build deve restare identica.

**Tech Stack:** Node 20+, Vite 8, vitest. Nessuna dipendenza nuova.

**Spec:** nessun documento separato — la convenzione è decisa in conversazione ed è il Task 1 di questo piano.

## Global Constraints

Dal `CLAUDE.md` di `/srv/claude/workspaces/`:

- **Mai `git push --force`**, mai cancellare rami remoti, mai `--no-verify`. Push bloccato → fermarsi e segnalare.
- **Mai committare su `main`.** Branch dedicato e PR; il merge lo decide una persona.
- Si lavora solo dentro `/srv/claude/workspaces/`. Ogni file cancellato va dichiarato, con il motivo.
- **Non leggere, copiare o stampare credenziali.**
- Identità commit `VPS Agent <agent@vps-agent.invalid>`, già globale.

Ogni commit termina con:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Vincoli di questo lavoro, e sono la sua sostanza:

- **NON si cambia una riga di codice.** Né una variabile rinominata, né una condizione semplificata, né un `const` al posto di un `let`. Se durante il lavoro salta all'occhio un bug: **non correggerlo**, annotalo e riferiscilo alla fine. Un difetto trovato è una buona notizia; correggerlo dentro un commit di commenti lo rende invisibile alla revisione.
- **I commenti che spiegano il *perché* non si toccano**, si traducono. Sono la ragione per cui certi bug non tornano.
- **Mai `terraform apply`/`plan`, mai `npm run migrate`, mai `wrangler deploy` o `secret`.**
- `npm run build` da solo fallisce apposta: usare `ALLOW_PLACEHOLDER_CSP=1 npm run build`.
- Branch: `commenti-e-jsdoc`, creato da `contatti-form-interno`.
- Test di partenza: **361**. Devono restare 361: questo lavoro non ne aggiunge e non ne toglie.

## La rete di sicurezza, verificata

La build minifica e rimuove i commenti. Quindi **l'impronta del bundle prodotto non cambia se cambiano solo i commenti** — è stato provato il 2026-09-21 aggiungendo un commento a un file e ottenendo lo stesso hash.

Da qui il controllo che chiude ogni task:

```bash
ALLOW_PLACEHOLDER_CSP=1 npm run build >/dev/null 2>&1
cat dist/assets/*.js | sha256sum | cut -c1-16
```

Se l'impronta differisce da quella registrata nel Task 1, **è stato toccato del codice**: va trovato cosa e rimesso a posto prima di committare. È una prova, non un'impressione.

## Lo stato di partenza, misurato

| Area | File | Funzioni esportate | File con JSDoc | Righe di commento |
|---|---|---|---|---|
| `src/shared` | 2 | 11 | 1 | 13 |
| `src/utils` | 10 | 11 | 6 | 87 |
| `src/worker` | 7 | 10 | 2 | 56 |
| `src/components` | 7 | 9 | 1 | 25 |
| `src/pages` | 6 | 3 | 0 | 14 |
| `src/providers` | 3 | 7 | 1 | 18 |
| `src/admin` | 15 | 25 | **0** | 73 |
| `scripts` | 4 | 9 | 2 | 47 |

`src/admin` è il buco più grande: venticinque funzioni esportate, nessun contratto scritto.

---

## File Structure

| File | Responsabilità |
|---|---|
| `CONTRIBUTING.md` | nuovo: la convenzione, e il resto delle regole per chi contribuisce |
| `README.md`, `README.it.md` | un rimando a `CONTRIBUTING.md` dalla sezione Contributing |
| tutti i `.js` di `src/` e `scripts/` | solo commenti |

---

### Task 1: La convenzione, scritta prima di applicarla

Va per prima perché tutto il resto la segue. Scritta dopo, sarebbe la descrizione di quello che è venuto fuori invece della regola che lo ha guidato.

**Files:**
- Create: `CONTRIBUTING.md`
- Modify: `README.md`, `README.it.md`

**Interfaces:**
- Consumes: niente
- Produces: la regola che i Task 2–7 applicano, e l'impronta di riferimento del bundle

- [ ] **Step 1: Creare il branch e registrare l'impronta di partenza**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git checkout contatti-form-interno && git checkout -b commenti-e-jsdoc
npm test 2>&1 | grep -E 'Tests'
ALLOW_PLACEHOLDER_CSP=1 npm run build >/dev/null 2>&1
cat dist/assets/*.js | sha256sum | cut -c1-16
```

Annotare i due valori: **361 test** e l'impronta. Sono il metro di tutti i task successivi.

- [ ] **Step 2: Scrivere `CONTRIBUTING.md`**

In inglese, come le altre guide tecniche. Deve contenere, in quest'ordine:

1. **Come si contribuisce** — fork, branch, PR; i test devono passare; niente dipendenze nuove senza motivo.
2. **La convenzione sui commenti**, che è il cuore:

   - **File header** — una o due righe su cosa fa il modulo e perché esiste. Solo dove il nome del file non basta.
   - **JSDoc su ogni funzione esportata** — descrizione, `@param`, `@returns`, `@throws` dove rilevante. È il contratto: cosa prende, cosa restituisce, cosa garantisce.
   - **Commenti inline solo per il perché.** Mai per il cosa. La regola pratica: *se il commento si può dedurre leggendo la riga sotto, va tolto.*

3. **Cosa si toglie** — separatori decorativi, commenti che ripetono il codice, blocchi commentati di codice morto.
4. **Cosa non si toglie mai** — e questa sezione va scritta con la stessa forza di un avvertimento, perché è quella che verrà ignorata: i commenti che spiegano una scelta contro-intuitiva. Vanno dati **esempi presi dal codice vero**, per esempio quello che spiega perché la validazione dell'email è permissiva, o perché in `albumsToRuntime` c'è `||` e non `??`. Chi legge deve capire che togliendoli riapre bug già chiusi.
5. **Lingua** — inglese, ovunque, compresi i messaggi di commit.
6. **Nei test** — stessa regola, ma il contratto lo esprime il nome del test: JSDoc non serve.

- [ ] **Step 3: Collegarlo dai due README**

Nella sezione *Contributing* di `README.md` e *Contribuire* di `README.it.md`, una riga che rimanda a `CONTRIBUTING.md` per la convenzione sul codice.

- [ ] **Step 4: Verificare**

```bash
npm test 2>&1 | grep -E 'Tests'
```

Atteso: 361. Questo task non tocca codice.

- [ ] **Step 5: Commit**

```bash
git add CONTRIBUTING.md README.md README.it.md
git commit -F - <<'EOF'
docs: la convenzione sui commenti, prima di applicarla

Scritta per prima perche' il resto del lavoro la segue: scritta dopo,
sarebbe stata la descrizione di quello che e' venuto fuori invece della
regola che lo ha guidato.

Il cuore e' la sezione su cosa NON si toglie: i commenti che spiegano
una scelta contro-intuitiva non sono decorazione, sono la ragione per
cui certi bug non tornano. Senza una regola scritta, il prossimo che
passa vede trecento righe di commento e "pulisce".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Il nucleo puro — `src/shared` e `src/utils`

Dodici file, ventidue funzioni esportate, ottantotto righe di commento. Si comincia da qui perché sono funzioni pure: il contratto è facile da scrivere con precisione, e gli esempi che ne escono fanno da modello ai task successivi.

**Files:**
- Modify: tutti i `.js` non-test in `src/shared/` e `src/utils/`

**Interfaces:**
- Consumes: la convenzione del Task 1
- Produces: il modello di JSDoc che i Task 3–7 imitano

- [ ] **Step 1: Inventario di ciò che manca**

```bash
for f in $(git ls-files 'src/shared/*.js' 'src/utils/*.js' | grep -v '\.test\.js$'); do
  n=$(grep -cE '^export (async )?(function|const)' "$f")
  d=$(grep -c '@param\|@returns' "$f")
  echo "$f  esportate:$n  righe-jsdoc:$d"
done
```

Serve a sapere dove si va a parare prima di cominciare, e a riconoscere a fine task se qualcosa è rimasto indietro.

- [ ] **Step 2: Applicare la convenzione, file per file**

Per ciascun file: intestazione dove serve, JSDoc su ogni funzione esportata, commenti inline tradotti in inglese conservando il *perché*, e via il rumore.

**Le frasi da non perdere.** Questi commenti contengono ragionamenti che vanno tradotti, non riassunti né cancellati:

- in `contact-rules.js`, perché la validazione dell'email è volutamente permissiva;
- in `buildMessage.js`, perché si copiano i campi uno a uno invece di usare lo spread, e perché i due punti spariscono dalla chiave;
- in `notifyBody.js`, perché il messaggio non esce di lì;
- in `buildHeaders.js`, perché Turnstile compare nella CSP solo quando è configurato;
- in `formatText.js`, perché la sostituzione è a una passata sola.

- [ ] **Step 3: La prova che è cambiato solo il commento**

```bash
npm test 2>&1 | grep -E 'Tests'
ALLOW_PLACEHOLDER_CSP=1 npm run build >/dev/null 2>&1
cat dist/assets/*.js | sha256sum | cut -c1-16
```

Atteso: **361 test**, e **l'impronta identica** a quella del Task 1 Step 1.

Se l'impronta è cambiata, è stato toccato del codice: `git diff` per trovare cosa, e rimetterlo com'era. Non commettere finché non torna.

- [ ] **Step 4: Verificare che non sia rimasto italiano**

```bash
grep -rniE '\b(perch|perche|quindi|invece|questo|questa|viene|serve|deve|senza|dalla|nella|come|gia)\b' \
  $(git ls-files 'src/shared/*.js' 'src/utils/*.js' | grep -v '\.test\.js$') || echo "PULITO"
```

Qualche falso positivo è normale (`come` può stare in un'URL): vanno guardati uno a uno, non soppressi.

- [ ] **Step 5: Commit**

```bash
git add src/shared src/utils
git commit -m "docs(core): JSDoc e commenti in inglese per shared e utils

Funzioni pure: il contratto si scrive con precisione, e gli esempi che
ne escono fanno da modello al resto del codice.

Conservati, tradotti, i commenti che spiegano il perche' di scelte
contro-intuitive: l'email validata in modo permissivo, i campi copiati
uno a uno invece che con lo spread, Turnstile nella CSP solo quando c'e'.

Impronta del bundle invariata: non e' cambiata una riga di codice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 3: Il Worker — `src/worker/` e `src/worker.js`

Sette file, dieci funzioni esportate, cinquantasei righe di commento. È il codice che gira in produzione su richieste di sconosciuti, e i suoi commenti sono i più carichi di ragioni di sicurezza.

**Files:**
- Modify: `src/worker.js` e tutti i `.js` non-test in `src/worker/`

**Interfaces:**
- Consumes: il modello del Task 2
- Produces: niente di nuovo

- [ ] **Step 1: Applicare la convenzione**

**Le frasi da non perdere**, tutte di sicurezza:

- in `contact-routes.js`, perché l'honeypot risponde 200 e non un errore; perché la notifica è dopo la scrittura e in `try/catch`; perché `now()` si chiama una volta sola; perché si guarda `Content-Length` prima di leggere il corpo;
- in `turnstile.js`, perché senza secret si passa ma con il secret ogni incertezza blocca;
- in `admin-routes.js`, perché l'id del messaggio è vincolato da una regex prima di entrare in una chiave R2;
- in `worker.js`, perché le API stanno prima della regex degli album, e perché il redirect di `/contatti` è 301;
- in `data-routes.js`, perché le letture sono `no-store`.

- [ ] **Step 2: La prova**

```bash
npm test 2>&1 | grep -E 'Tests'
ALLOW_PLACEHOLDER_CSP=1 npm run build >/dev/null 2>&1
cat dist/assets/*.js | sha256sum | cut -c1-16
```

Atteso: 361 test, impronta invariata.

- [ ] **Step 3: Commit**

```bash
git add src/worker.js src/worker
git commit -m "docs(worker): JSDoc e commenti in inglese

E' il codice che risponde a richieste di sconosciuti, e i suoi commenti
sono quasi tutti ragioni di sicurezza: perche' l'honeypot risponde 200,
perche' l'id del messaggio passa da una regex prima di diventare una
chiave R2, perche' le API stanno prima della regex degli album.
Tradotti, non riassunti.

Impronta del bundle invariata.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 4: Il sito pubblico — `src/providers`, `src/pages`, `src/components`

Sedici file, diciannove funzioni esportate, cinquantasette righe di commento.

**Files:**
- Modify: tutti i `.js` non-test in `src/providers/`, `src/pages/`, `src/components/`

**Interfaces:**
- Consumes: il modello del Task 2
- Produces: niente di nuovo

- [ ] **Step 1: Applicare la convenzione**

**Le frasi da non perdere:**

- in `about.js`, perché il form si costruisce dopo la fetch della config e non prima — è il difetto trovato in revisione, e il commento è ciò che impedisce di rimetterlo;
- in `home-logic.js`, il fallback asimmetrico verso i valori di build;
- in `Lightbox.js`, la logica del focus trap e il comportamento del Tab;
- in `site.config.js` e nei componenti, perché certi campi usano l'optional chaining (il file è importato anche da Node, dove `import.meta.env` non esiste).

- [ ] **Step 2: La prova**

```bash
npm test 2>&1 | grep -E 'Tests'
ALLOW_PLACEHOLDER_CSP=1 npm run build >/dev/null 2>&1
cat dist/assets/*.js | sha256sum | cut -c1-16
```

Atteso: 361 test, impronta invariata.

- [ ] **Step 3: Commit**

```bash
git add src/providers src/pages src/components
git commit -m "docs(site): JSDoc e commenti in inglese per il sito pubblico

Conservato in particolare il commento in about.js che spiega perche' il
form si costruisce dopo la fetch della config: e' un difetto trovato in
revisione, e quel commento e' cio' che impedisce di rimetterlo.

Impronta del bundle invariata.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 5: La dashboard — `src/admin`

Quindici file, venticinque funzioni esportate, **nessuna con JSDoc**. È il task più grosso e quello che cambia di più le carte: è la parte di codice oggi meno leggibile da chi arriva da fuori.

**Files:**
- Modify: tutti i `.js` non-test in `src/admin/` e `src/admin/views/`

**Interfaces:**
- Consumes: il modello del Task 2
- Produces: niente di nuovo

- [ ] **Step 1: Applicare la convenzione**

Essendo venticinque funzioni senza contratto, qui il JSDoc è quasi tutto da scrivere. Per ciascuna serve almeno: cosa fa, cosa riceve, cosa restituisce, e — dove il modulo ha uno stato — cosa cambia di quello stato.

**Le frasi da non perdere:**

- in `preview.js`, perché esiste il token di render e perché la lightbox va smontata esplicitamente;
- in `album.js`, perché il sortable si aggancia una volta sola e non dentro `renderPhotos`, e perché la guardia `beforeunload` si stacca su `hashchange`;
- in `pipeline.js`, che è il sostituto lato client di `compress.js` e ne condivide i parametri;
- in `exif.js`, perché l'estrazione non deve mai bloccare l'upload;
- in `status.js`, perché `say()` del closure può puntare a un nodo ricreato dal re-render.

- [ ] **Step 2: La prova**

```bash
npm test 2>&1 | grep -E 'Tests'
ALLOW_PLACEHOLDER_CSP=1 npm run build >/dev/null 2>&1
cat dist/assets/*.js | sha256sum | cut -c1-16
```

Atteso: 361 test, impronta invariata.

- [ ] **Step 3: Commit**

```bash
git add src/admin
git commit -m "docs(admin): JSDoc su venticinque funzioni che non ne avevano

Era la parte di codice meno leggibile da chi arriva da fuori: quindici
file, venticinque funzioni esportate, zero contratti scritti.

Conservati i commenti che spiegano i punti fragili gia' costati un bug:
il token di render della preview, il sortable agganciato una volta
sola, la guardia beforeunload staccata su hashchange.

Impronta del bundle invariata.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 6: Script e configurazione — `scripts/`, `config/`, `theme/`

Quattro script, nove funzioni esportate, quarantasette righe di commento. Più i file di `config/` e `theme/`, che non hanno funzioni ma **i commenti più letti del progetto**: sono quelli che chi personalizza il template vede per primi.

**Files:**
- Modify: tutti i `.js` non-test in `scripts/`, tutti i `.js` in `config/`, i `.css` in `theme/` e `src/styles/card-variants/`

**Interfaces:**
- Consumes: il modello del Task 2
- Produces: niente di nuovo

- [ ] **Step 1: Applicare la convenzione agli script**

**Le frasi da non perdere:**

- in `migrate.js`, perché `||` e non `??` per `coverName` — il seed usa la stringa vuota, e con `??` il sito rifiuta i propri dati appena migrati. È il bug trovato in revisione al punto 3;
- in `compress.js`, i parametri (1900px, q85) e perché i RAW non sono supportati;
- in `gen-wrangler.js`, perché fallisce dicendo quale chiave manca.

- [ ] **Step 2: I commenti di `config/` e `theme/`**

Qui la regola è la stessa ma il lettore è diverso: non un contributore, ma **chi ha appena forkato il template e apre quel file per personalizzarlo**. I commenti devono dire cosa mettere e cosa succede se si sbaglia, non come funziona il codice.

Conservare in particolare l'avvertenza che `config/` è solo il seed e che `migrate` rilanciato sovrascrive il lavoro della dashboard.

- [ ] **Step 3: La prova**

```bash
npm test 2>&1 | grep -E 'Tests'
ALLOW_PLACEHOLDER_CSP=1 npm run build >/dev/null 2>&1
cat dist/assets/*.js | sha256sum | cut -c1-16
```

Atteso: 361 test, impronta invariata.

Nota: i CSS di `theme/` e delle varianti **non** entrano nel bundle JS, quindi l'impronta non li copre. Per quelli la verifica è che la build passi e che `dist/assets/*.css` esista.

- [ ] **Step 4: Commit**

```bash
git add scripts config theme src/styles
git commit -m "docs(scripts,config): commenti in inglese, e il lettore cambia

Negli script vale la convenzione come altrove. In config/ e theme/ il
lettore non e' un contributore ma chi ha appena forkato: li' i commenti
dicono cosa mettere e cosa succede se si sbaglia, non come funziona il
codice.

Conservata l'avvertenza che config/ e' solo il seed e che migrate
rilanciato sovrascrive il lavoro fatto dalla dashboard, e la ragione
per cui coverName usa || e non ??.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 7: La verifica finale

Non è una formalità: è il momento in cui si controlla che sei task di modifiche diffuse non abbiano lasciato buchi.

**Files:**
- Nessuna modifica prevista. Se ne servono, sono correzioni dei task precedenti.

- [ ] **Step 1: Ogni funzione esportata ha il suo contratto**

```bash
for f in $(git ls-files 'src/*.js' 'scripts/*.js' | grep -v '\.test\.js$'); do
  n=$(grep -cE '^export (async )?(function|const)' "$f")
  d=$(grep -c '@param\|@returns\|@type' "$f")
  [ "$n" -gt 0 ] && [ "$d" -eq 0 ] && echo "SENZA JSDOC: $f ($n esportate)"
done
echo "--- fine elenco ---"
```

Atteso: elenco vuoto. Se resta qualche file, va completato adesso.

- [ ] **Step 2: Non è rimasto italiano**

```bash
grep -rniE '\b(perche|perch|quindi|invece|questo|questa|viene|serve|deve|senza|dalla|nella|gia|cosi|anche|solo se|ogni)\b' \
  $(git ls-files 'src/*.js' 'scripts/*.js' 'config/*.js') | grep -v '\.test\.js:' | head -30
echo "--- fine elenco ---"
```

I falsi positivi esistono: `come` in un URL, `ogni` dentro una stringa di interfaccia italiana in `texts.config.js`. Vanno guardati uno a uno. **Le stringhe di `texts.config.js` non si traducono**: sono il copy predefinito del sito, e cambiarne la lingua è una decisione a parte.

- [ ] **Step 3: La prova complessiva**

```bash
npm test 2>&1 | grep -E 'Tests|Test Files'
ALLOW_PLACEHOLDER_CSP=1 npm run build >/dev/null 2>&1
cat dist/assets/*.js | sha256sum | cut -c1-16
```

Atteso: **361 test**, e **l'impronta identica a quella registrata nel Task 1**. Questa è la dimostrazione che sei task di modifiche non hanno toccato una riga di codice.

- [ ] **Step 4: Il controllo che nessuno script può fare**

Rileggere `git diff contatti-form-interno..HEAD -- '*.js'` cercando **righe cancellate che non siano commenti**. Una riga di codice sparita in mezzo a trecento righe di commenti riscritti è esattamente ciò che sfugge a un occhio stanco — e l'impronta del bundle la prenderebbe, ma solo se è cambiata la semantica: una riga morta rimossa potrebbe non cambiarla.

- [ ] **Step 5: Riferire i difetti trovati e non corretti**

Durante sei task di lettura ravvicinata è probabile che sia saltato all'occhio qualcosa. **Non vanno corretti qui**: vanno elencati, con file e riga, per decidere dopo. Se l'elenco è vuoto, dirlo.

---

## Self-Review

**Copertura.** Le otto aree della tabella iniziale sono coperte: `src/shared` e `src/utils` dal Task 2, `src/worker` dal 3, `src/providers`/`src/pages`/`src/components` dal 4, `src/admin` dal 5, `scripts` più `config` e `theme` dal 6. Il Task 7 verifica che non sia rimasto nulla.

**Segnaposto.** Nessun TBD. I task non riportano il testo dei commenti da scrivere, ed è deliberato: scrivere qui settanta blocchi JSDoc significherebbe scrivere due volte lo stesso lavoro e farlo divergere. Quello che i task riportano — ed è la parte che conta — è **l'elenco puntuale dei commenti da non perdere**, file per file, perché è lì che si fanno i danni.

**Coerenza.** Il comando dell'impronta è identico nei Task 1, 2, 3, 4, 5, 6 e 7. Il numero atteso dei test è 361 ovunque.

**Un limite dichiarato.** L'impronta del bundle prova che il codice JavaScript non è cambiato, ma **non copre il CSS**, che non entra in quel bundle, né i file `.test.js`, che non finiscono nella build. Per i test la rete è il loro stesso numero, 361; per il CSS resta solo la rilettura del Task 7 Step 4.

**Una cosa che questo piano non fa.** Non traduce le stringhe di `config/texts.config.js`, che sono il copy predefinito del sito e oggi sono in italiano. È una stonatura vera in un template inglese, ma è una decisione di prodotto — cosa vede chi forka appena apre il sito — non una questione di commenti.
