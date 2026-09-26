# F0 — Installazione a freddo e audit: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verificare che `PhotoPortfolioTemplate` sia installabile da un destinatario, correggere i difetti strutturali che emergono e lasciare due guardie automatiche che impediscano alle due classi di difetto ricorrenti di rientrare.

**Architecture:** Si clona il repo due volte. Il primo clone misura lo stato attuale seguendo `README.md` e `SETUP.md` alla lettera e produce la lista degli attriti. Poi si correggono solo i difetti strutturali — quelli che sopravvivono alla sostituzione del percorso Drive con R2 in F1/F2 — e si aggiungono due test di igiene del repo. Il secondo clone, da `HEAD` aggiornato, verifica che le correzioni siano visibili al destinatario e non solo nell'albero di lavoro.

**Tech Stack:** Node 20+, Vitest 4 (già in uso), git. Nessuna dipendenza nuova.

## Global Constraints

- **Si corregge solo ciò che sopravvive a F1/F2.** Gli attriti specifici del percorso Drive/GCP/Web3Forms si registrano nell'audit, non si riscrivono. Spec §2.1.
- **Nessun passo richiede account esterni.** I passi che li richiederebbero si annotano, si saltano con valori fittizi e la simulazione prosegue. Spec §4.1.
- **Le guardie vanno viste fallire** prima di essere considerate finite. Una guardia mai vista fallire è codice che si presume funzioni. Spec §5.
- **Superficie delle guardie:** solo file **tracciati** (`git ls-files`), limitati a ciò che viene consegnato come sito del destinatario. `docs/` è escluso di proposito: contiene la pianificazione interna, che parla legittimamente dei repo personali. Spec §4.3.
- **`CLONE_DIR`**: una directory vuota fuori dal repo, diversa per ciascuno dei due cloni. Qualunque percorso va bene purché non sia dentro l'albero di lavoro.
- I test nuovi dichiarano `// @vitest-environment node`: `vite.config.js` imposta `jsdom` globalmente, e queste guardie leggono il filesystem, non il DOM.

---

## Stato di partenza verificato

Rilevato il 20 settembre 2026, prima di iniziare. Il piano si basa su questi fatti:

| Fatto | Valore |
|---|---|
| Test che passano | **92** (14 file) |
| Claim nel README | "86 test" — **falso** |
| `SETUP.md` | esiste su disco, **non tracciato** |
| README che cita `SETUP.md` | **zero occorrenze** — la guida principale è irraggiungibile dal README |
| `engines` in `package.json` | **assente** |
| `.env.example` | tracciato, e allineato alle due variabili lette dal codice (`VITE_DRIVE_API_KEY`, `VITE_WEB3FORMS_ACCESS_KEY`) — **nessun difetto** |
| `config/site.config.js`, `config/albums.config.js` | valori segnaposto, **nessun dato personale** |
| `your-github-user` nei file tracciati | solo in `docs/` (pianificazione interna) |
| `your-github-user/your-portfolio` in `SETUP.md` | presente e **legittimo** — diventa rilevante appena `SETUP.md` è tracciato |
| Altri file non tracciati | `docs/maintainers/superpowers/plans/2026-07-06-m1-google-drive-provider.md`, `...-m2-config-theming.md`, `...-m3-gallery-components.md` |

---

## Task 1: Prima simulazione e lista degli attriti

Non è un task TDD: produce una misura, non codice. Le correzioni arrivano dopo.

**Files:**
- Create: `docs/cold-install-audit.md`

**Interfaces:**
- Consumes: niente.
- Produces: `docs/cold-install-audit.md`, la tabella degli attriti con la colonna "Sopravvive a F1/F2?". I Task 2–4 correggono **solo** le righe con `sì`.

- [ ] **Step 1: Clonare in una directory pulita**

```bash
CLONE_DIR=/tmp/pp-f0-clone-1
rm -rf "$CLONE_DIR"
git clone /path/to/PhotoPortfolioTemplate "$CLONE_DIR"
cd "$CLONE_DIR" && ls -a
```

Atteso: il clone contiene solo i file tracciati. `SETUP.md` **non c'è** — è il primo attrito, e va registrato.

- [ ] **Step 2: Seguire il Quick Start del README alla lettera**

Dal clone, eseguire nell'ordine esatto in cui il README li elenca:

```bash
node --version
npm install
cp .env.example .env
npm run build
npm test
```

Per ciascuno annotare: cosa diceva l'istruzione, cosa è successo, se ha bloccato / rallentato / confuso. Nota attesa su `npm test`: il README dichiara 86 test, ne passeranno 92.

- [ ] **Step 3: Avviare il dev server e guardare cosa vede un destinatario senza chiavi**

```bash
npm run dev
```

Aprire `http://localhost:5173/`, `/album.html` e `/contatti.html`. La domanda da rispondere, e da registrare testualmente nell'audit: **un destinatario che non ha ancora configurato Drive capisce dalla pagina cosa manca e dove configurarlo, o vede una pagina bianca?** Spec §4.1. Fermare il server con Ctrl-C.

- [ ] **Step 4: Percorrere SETUP.md dalla copia nell'albero di lavoro**

`SETUP.md` non è nel clone, quindi va letto dall'albero di lavoro — e questo è già l'attrito più grave. Percorrerne le fasi in ordine: dove una fase richiede Google Cloud, Web3Forms o Cloudflare, annotare cosa avrebbe richiesto, usare un valore fittizio e proseguire. Registrare fin dove il percorso regge.

- [ ] **Step 5: Scrivere la lista degli attriti**

Creare `docs/cold-install-audit.md` con questa struttura, ordinata per gravità (*blocca* prima di *rallenta* prima di *confonde*):

```markdown
# Audit dell'installazione a freddo

**Data:** 2026-09-20
**Metodo:** clone pulito di `HEAD`, README e SETUP seguiti alla lettera, senza account esterni.
**Spec:** `docs/maintainers/superpowers/specs/2026-09-20-f0-cold-install-audit-design.md`

## Limiti di questa simulazione

Un clone locale non riproduce del tutto "Use this template": GitHub non copia
allo stesso modo workflow, impostazioni del repo e branch protection. La
verifica completa di quel percorso avviene in F8, con un destinatario reale
su un account reale.

## Attriti

| # | Passo | Atteso | Osservato | Gravità | Sopravvive a F1/F2? |
|---|---|---|---|---|---|
| 1 | SETUP.md, prerequisito | La guida completa al setup è il documento da seguire | Non è nel clone: non è tracciata in git | blocca | sì |
| 2 | README, Quick start | `npm test` esegue "86 test" | Ne passano 92: il claim è falso | confonde | sì |
| 3 | README, tutto | Il README rimanda alla guida di setup | Non nomina mai SETUP.md: un destinatario non scopre che esiste | blocca | sì |

## Registrati, non corretti

Attriti specifici del percorso Drive/GCP/Web3Forms, che F1/F2 sostituiranno.

## Domande aperte emerse

- Ha senso che un destinatario riceva i file di pianificazione in `docs/`?
```

- [ ] **Step 6: Commit**

```bash
cd /path/to/PhotoPortfolioTemplate
git add docs/cold-install-audit.md
git commit -m "docs: audit dell'installazione a freddo, stato pre-correzioni"
```

---

## Task 2: Guardia sui documenti di onboarding

La guardia asserisce due cose: che i documenti di onboarding siano **tracciati**, e che ogni file che citano **esista**. Servono entrambe. Il difetto originale — `SETUP.md` non tracciato — non sarebbe stato trovato dalla sola seconda asserzione, perché nessun documento tracciato cita `SETUP.md`.

**Files:**
- Create: `tests/repo/docs-reference-existing-files.test.js`
- Modify: `README.md` (aggiunta del rimando a `SETUP.md`)

**Interfaces:**
- Consumes: niente.
- Produces: la costante `ONBOARDING_DOCS = ['README.md', 'SETUP.md', 'CUSTOMIZING.md']` e l'helper `trackedFiles()`. Il Task 3 usa lo stesso approccio a `git ls-files` ma con la propria lista di superficie: i due file restano indipendenti, non condividono import.

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `tests/repo/docs-reference-existing-files.test.js`:

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// I documenti che un destinatario deve poter leggere per installare il sito.
const ONBOARDING_DOCS = ['README.md', 'SETUP.md', 'CUSTOMIZING.md'];

// Una stringa in backtick vale come riferimento a un file solo se ha
// un'estensione nota: così comandi e frammenti di codice non vengono
// scambiati per percorsi.
const PATH_RE = /^[A-Za-z0-9_./-]+\.(js|css|json|jsonc|md|html|example|yml)$/;

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function referencedPaths(markdown) {
  return [...markdown.matchAll(/`([^`\n]+)`/g)]
    .map(match => match[1])
    .filter(text => PATH_RE.test(text));
}

describe('documentazione di onboarding', () => {
  const tracked = trackedFiles();

  // Il difetto che ha motivato questa guardia: SETUP.md era l'unica guida
  // al setup e non era tracciata, quindi chi creava un repo da "Use this
  // template" non la riceveva. Un documento di onboarding non tracciato,
  // per il destinatario, non esiste.
  it.each(ONBOARDING_DOCS)('%s è tracciato in git', doc => {
    expect(tracked).toContain(doc);
  });

  it.each(ONBOARDING_DOCS)('ogni file citato in %s esiste', doc => {
    const timesSeen = new Map();
    for (const path of tracked) {
      const base = path.split('/').pop();
      timesSeen.set(base, (timesSeen.get(base) ?? 0) + 1);
    }

    const missing = referencedPaths(readFileSync(doc, 'utf8')).filter(ref => {
      if (tracked.includes(ref)) return false;
      // I documenti citano a volte il solo nome del file ("googleDrive.js"),
      // non il percorso: vale se identifica un unico file tracciato.
      return timesSeen.get(ref) !== 1;
    });

    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
npx vitest run tests/repo/docs-reference-existing-files.test.js
```

Atteso: FAIL su `SETUP.md è tracciato in git` — l'array dei file tracciati non contiene `SETUP.md`. È il difetto reale, non un fallimento artificiale.

- [ ] **Step 3: Correggere il difetto tracciando i file mancanti**

```bash
git add SETUP.md
git add docs/maintainers/superpowers/plans/2026-07-06-m1-google-drive-provider.md \
        docs/maintainers/superpowers/plans/2026-07-06-m2-config-theming.md \
        docs/maintainers/superpowers/plans/2026-07-06-m3-gallery-components.md
```

- [ ] **Step 4: Rendere `SETUP.md` raggiungibile dal README**

Il README non lo menziona mai: un destinatario non scopre che esiste. In `README.md`, subito sotto il titolo `## Quick start` e prima del blocco di comandi, inserire:

```markdown
> Per il percorso completo da zero a sito online — cartelle Drive, chiavi API, deploy — vedi [`SETUP.md`](SETUP.md). Per la personalizzazione di tema e testi, [`CUSTOMIZING.md`](CUSTOMIZING.md).
```

- [ ] **Step 5: Eseguire il test e verificare che passi**

```bash
npx vitest run tests/repo/docs-reference-existing-files.test.js
```

Atteso: PASS su tutti e sei i casi (tre documenti × due asserzioni). Se un riferimento risulta mancante, è un attrito vero: aggiungerlo all'audit e correggerlo.

- [ ] **Step 6: Verificare che la guardia sappia fallire sui riferimenti**

Aggiungere temporaneamente in fondo a `CUSTOMIZING.md` la riga:

```markdown
Vedi `theme/non-esiste.css` per i dettagli.
```

```bash
npx vitest run tests/repo/docs-reference-existing-files.test.js
```

Atteso: FAIL con `theme/non-esiste.css` nell'array dei mancanti. Poi rimuovere la riga e rieseguire: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/repo/docs-reference-existing-files.test.js README.md SETUP.md \
        docs/maintainers/superpowers/plans/2026-07-06-m1-google-drive-provider.md \
        docs/maintainers/superpowers/plans/2026-07-06-m2-config-theming.md \
        docs/maintainers/superpowers/plans/2026-07-06-m3-gallery-components.md
git commit -m "test: guardia sui documenti di onboarding, e traccia SETUP.md

SETUP.md era l'unica guida al setup e non era tracciata: chi creava un repo
da Use this template non la riceveva. Il README inoltre non la menzionava,
quindi nemmeno un controllo sui riferimenti l'avrebbe trovata — la guardia
asserisce perciò anche che i documenti di onboarding siano tracciati."
```

---

## Task 3: Guardia sui dati personali

**Files:**
- Create: `tests/repo/no-personal-data.test.js`

**Interfaces:**
- Consumes: niente. Ridefinisce il proprio `trackedFiles()` invece di importarlo dal Task 2: le due guardie restano leggibili e modificabili in isolamento.
- Produces: la lista `ALLOWED` di coppie file + stringa, che F1 e F2 estenderanno quando porteranno codice dal sito personale.

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `tests/repo/no-personal-data.test.js`:

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Ciò che viene consegnato come sito del destinatario. docs/ è escluso di
// proposito: contiene la pianificazione interna, che parla legittimamente
// dei repo di Davide e del sito personale.
const SHIPPED_PREFIXES = ['config/', 'src/', 'theme/', 'public/', 'scripts/'];
const SHIPPED_FILES = [
  'README.md', 'SETUP.md', 'CUSTOMIZING.md',
  'package.json', 'wrangler.jsonc', '.env.example', 'vite.config.js',
  'index.html', 'album.html', 'contatti.html',
];

const PERSONAL_PATTERNS = [
  /your-github-user/i,
  /davide\.tarsi/i,
  // Un bucket R2 pubblico reale: 32 esadecimali. Un segnaposto tipo
  // pub-XXXX.r2.dev non corrisponde, quindi non dà falsi positivi.
  /pub-[0-9a-f]{32}\.r2\.dev/i,
];

// Riferimenti legittimi, come coppie file + stringa esatta. Non pattern
// generici: un nuovo riferimento personale non deve poter passare per
// somiglianza con uno lecito. Si parte vuota di proposito: ogni voce entra
// qui solo dopo che il test ha dimostrato di averne bisogno.
const ALLOWED = [];

function shippedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(path =>
      SHIPPED_FILES.includes(path) ||
      SHIPPED_PREFIXES.some(prefix => path.startsWith(prefix)));
}

// Rimuove dal contenuto le stringhe esplicitamente ammesse per quel file,
// così restano solo le occorrenze non giustificate.
function withoutAllowed(file, content) {
  return ALLOWED
    .filter(entry => entry.file === file)
    .reduce((text, entry) => text.split(entry.text).join(''), content);
}

describe('superficie consegnata al destinatario', () => {
  it('non contiene dati personali', () => {
    const offenders = [];

    for (const file of shippedFiles()) {
      const content = withoutAllowed(file, readFileSync(file, 'utf8'));
      for (const pattern of PERSONAL_PATTERNS) {
        const match = content.match(pattern);
        if (match) offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
npx vitest run tests/repo/no-personal-data.test.js
```

Atteso: FAIL con `SETUP.md: your-github-user` fra gli offenders. `SETUP.md`, tracciata nel Task 2, cita il repo sorgente del template — ed è corretto che lo faccia. Il fallimento dimostra che la guardia vede davvero la superficie consegnata.

- [ ] **Step 3: Ammettere il riferimento legittimo**

Il riferimento al repo sorgente è lecito, quindi entra nell'allowlist — ora che il test ne ha dimostrato la necessità. Sostituire `const ALLOWED = [];` con:

```js
const ALLOWED = [
  { file: 'SETUP.md', text: 'your-github-user/your-portfolio' },
];
```

```bash
npx vitest run tests/repo/no-personal-data.test.js
```

Atteso: PASS.

- [ ] **Step 4: Verificare che la guardia veda un bucket R2 reale**

In `config/site.config.js` la chiave `heroImageUrl` esiste già con valore `''`. Sostituirne **temporaneamente** il valore:

```js
  heroImageUrl: 'https://pub-xxxxxxxx.r2.dev/sport/cover.webp',
```

```bash
npx vitest run tests/repo/no-personal-data.test.js
```

Atteso: FAIL con `config/site.config.js: pub-xxxxxxxx.r2.dev` fra gli offenders. Poi ripristinare `heroImageUrl: ''` e rieseguire: PASS.

- [ ] **Step 5: Verificare che l'allowlist sia stretta e non generica**

Aggiungere temporaneamente in `README.md`:

```markdown
Contatto: portfolio.example
```

```bash
npx vitest run tests/repo/no-personal-data.test.js
```

Atteso: FAIL con `README.md: your-github-user`. La voce di allowlist per `SETUP.md` **non** deve coprire un'occorrenza in un altro file: è la verifica che l'allowlist sia per coppia file + stringa e non per pattern. Rimuovere la riga e rieseguire: PASS.

- [ ] **Step 6: Eseguire l'intera suite**

```bash
npm test
```

Atteso: tutti i file passano, incluse le due guardie nuove.

- [ ] **Step 7: Commit**

```bash
git add tests/repo/no-personal-data.test.js
git commit -m "test: guardia contro i dati personali nella superficie consegnata

Il porting di 18 file dal sito personale in F1 e F2 è una sorgente attiva
di riferimenti personali. docs/ è escluso: contiene pianificazione interna
che parla legittimamente dei repo di Davide."
```

---

## Task 4: Correzione dei claim del README e dichiarazione di `engines`

**Files:**
- Modify: `README.md` (rimozione del conteggio dei test)
- Modify: `package.json` (aggiunta di `engines`)

**Interfaces:**
- Consumes: niente.
- Produces: niente che i task successivi importino. Il Task 5 verifica il risultato dal clone.

- [ ] **Step 1: Togliere il conteggio dei test dal README**

Nel blocco Quick start di `README.md`, sostituire la riga:

```bash
npm test         # 86 test
```

con:

```bash
npm test
```

Il numero è falso (i test sono 92) e cambierà a ogni fase da qui a F9. Un claim che nessuno terrà aggiornato è meglio non farlo, e non è azionabile per chi legge. Spec §3.

- [ ] **Step 2: Dichiarare `engines` in `package.json`**

Il README dichiara `node --version # richiede v20+`, ma `package.json` non lo impone: npm non avvisa chi usa una versione più vecchia. Aggiungere dopo `"type": "module",`:

```json
  "engines": {
    "node": ">=20"
  },
```

Risultato atteso delle prime righe di `package.json`:

```json
{
  "name": "photo-portfolio",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
```

- [ ] **Step 3: Verificare che nulla si sia rotto**

```bash
npm test && npm run build
```

Atteso: 92 test passati, build completata senza errori.

- [ ] **Step 4: Commit**

```bash
git add README.md package.json
git commit -m "fix: dichiara engines e toglie il conteggio dei test dal README

Il README dichiarava 86 test quando sono 92: un numero che nessuno terrà
aggiornato e che non è azionabile per chi legge. Il requisito su Node
passa invece da prosa a dichiarazione, così è npm ad avvisare."
```

---

## Task 5: Secondo clone, verifica e chiusura dell'audit

Il primo clone ha misurato. Questo verifica che le correzioni siano visibili **al destinatario**, non solo nell'albero di lavoro — dove `SETUP.md` esisteva comunque, tracciato o no.

**Files:**
- Modify: `docs/cold-install-audit.md`

**Interfaces:**
- Consumes: `docs/cold-install-audit.md` dal Task 1; le correzioni dei Task 2–4.
- Produces: l'audit chiuso, con l'esito di ogni riga. È il backlog di dettaglio a cui attingono F1 e le fasi successive.

- [ ] **Step 1: Clonare di nuovo, da `HEAD` aggiornato**

```bash
CLONE_DIR=/tmp/pp-f0-clone-2
rm -rf "$CLONE_DIR"
git clone /path/to/PhotoPortfolioTemplate "$CLONE_DIR"
cd "$CLONE_DIR" && ls SETUP.md CUSTOMIZING.md README.md
```

Atteso: i tre documenti sono presenti nel clone.

- [ ] **Step 2: Ripercorrere il Quick Start dal clone nuovo**

```bash
npm install
cp .env.example .env
npm test
npm run build
```

Atteso: 92 test passati — incluse le due guardie, che nel clone devono passare anche lì; build completata.

- [ ] **Step 3: Verificare il dev server**

```bash
npm run dev
```

Aprire le tre pagine. Criterio di chiusura, dalla spec §4.1: il server parte, le pagine rendono, e lo stato di errore per le chiavi mancanti dice cosa manca e dove configurarlo. Se così non è, registrarlo come attrito **strutturale** — cambierà la sorgente dati in F1, non il fatto che il primo avvio avvenga senza credenziali. Ctrl-C per fermare.

- [ ] **Step 4: Chiudere l'audit**

In `docs/cold-install-audit.md`, aggiungere a ogni riga della tabella l'esito (`corretto in Task N` / `registrato, non corretto`) e aggiungere in fondo:

```markdown
## Esito della verifica (secondo clone)

Clone di `HEAD` dopo le correzioni:

- [x] i documenti di onboarding sono presenti nel clone
- [x] `npm test` e `npm run build` verdi dal clone
- [ ] `npm run dev`: le pagine rendono e l'errore per le chiavi mancanti è comprensibile

## Cosa passa a F1

Gli attriti marcati "registrato, non corretto" e le domande aperte restano
il backlog delle fasi successive.
```

Spuntare la terza casella solo se lo Step 3 lo conferma; altrimenti lasciarla vuota con la nota di cosa si è visto.

- [ ] **Step 5: Pulire le directory temporanee**

```bash
rm -rf /tmp/pp-f0-clone-1 /tmp/pp-f0-clone-2
```

- [ ] **Step 6: Commit**

```bash
cd /path/to/PhotoPortfolioTemplate
git add docs/cold-install-audit.md
git commit -m "docs: chiude l'audit di F0 con la verifica dal secondo clone"
```

---

## Definition of done di F0

- [ ] `docs/cold-install-audit.md` esiste, ordinato per gravità, con la colonna di sopravvivenza e l'esito compilati.
- [ ] Da un clone fatto dopo le correzioni si arriva a `npm run dev` seguendo solo la documentazione tracciata.
- [ ] `npm test` e `npm run build` verdi da quel clone.
- [ ] Le due guardie passano, e **ognuna è stata vista fallire** per il motivo giusto (Task 2 Step 2 e Step 6; Task 3 Step 2, Step 4 e Step 5).
- [ ] I difetti strutturali sono corretti; quelli Drive-era sono registrati e non corretti.
- [ ] Il claim sul numero di test non è più nel README; `package.json` dichiara `engines`.

## Fuori scope

- Modifiche al percorso Drive/GCP/Web3Forms oltre alla registrazione degli attriti.
- Il cammino con account esterni (→ F8).
- Una terza guardia, salvo che l'audit riveli una terza classe silenziosa e ricorrente.
- Il porting di codice dal sito personale (→ F1, F2).

## Binario parallelo, non bloccante

Individuare **due** amici sviluppatori che fotografano e sentire il primo, chiedendogli cosa si aspetta di poter fare da solo dopo la consegna. Scadenza: **prima dell'inizio di F2**, perché la risposta vincola lo scope della dashboard. Non blocca la chiusura di F0.
