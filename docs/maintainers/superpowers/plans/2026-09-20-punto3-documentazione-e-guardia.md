# Punto 3 — Documentazione riscritta e guardia su `migrate` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il template usabile da qualcuno che non sia il suo autore: documentazione che descrive l'architettura vera, e un `migrate` che non distrugge i contenuti di chi lo rilancia per sbaglio.

**Architecture:** Tre interventi indipendenti. Una guardia in `scripts/migrate.js` che si rifiuta di sovrascrivere dati già presenti su R2, con la decisione isolata in una funzione pura. Un allineamento del seed degli album alla forma già adottata per l'hero. La riscrittura di `README.md` e `CUSTOMIZING.md`, che descrivono ancora Google Drive.

**Tech Stack:** Node 20+, `@aws-sdk/client-s3`, vitest.

**Spec:** [analisi §4.2 e §6](../specs/2026-09-20-template-distribuibile-analisi.md), punto 3 dell'ordine dei lavori §7, e i punti 1 e 4 dell'[audit di luglio](../specs/2026-07-12-boilerplate-template-audit.md).

## Global Constraints

Dal `CLAUDE.md` di `/srv/claude/workspaces/`:

- **Mai `git push --force`**, mai cancellare rami remoti, mai `--no-verify`. Push bloccato → fermarsi e segnalare.
- **Mai committare su `main`.** Branch dedicato e PR; il merge lo decide una persona.
- Si lavora solo dentro `/srv/claude/workspaces/`. Ogni file cancellato va dichiarato, con il motivo.
- **Non leggere, copiare o stampare credenziali.** In questo punto non serve nessuna credenziale: `migrate` non va mai eseguito davvero, solo testato.
- Identità commit `VPS Agent <agent@vps-agent.invalid>`, già globale.

Ogni commit termina con:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Vincoli tecnici:

- **Mai eseguire `npm run migrate` senza `--dry-run`**: scriverebbe su un bucket R2 vero.
- **Mai `terraform apply` né `terraform plan`.**
- `npm run build` da solo **fallisce di proposito**, perché `wrangler.json` versionato contiene segnaposto. Per le verifiche usare `ALLOW_PLACEHOLDER_CSP=1 npm run build`.
- Branch di lavoro: `punto3-documentazione`, creato da `main`.
- Test di partenza: **281**.

## Stato di partenza verificato

Verificato il 2026-09-20 su `main`:

- `CUSTOMIZING.md` contiene **11 riferimenti a Google Drive** (`driveApiKey`, `driveFolderId`, `lh3.googleusercontent.com`): descrive un'architettura che non esiste più.
- `README.md` ha la checklist di setup dell'era Drive, e sopra un avviso provvisorio messo durante il bootstrap. La sezione sul fork, invece, è attuale e va conservata.
- `scripts/migrate.js` ha solo `--dry-run`. Rilanciato dopo l'uso della dashboard, **sovrascrive** `_site/site.json` e `_data/albums.json` col seed dei file, senza chiedere nulla.
- `config/albums.config.js` usa `coverUrl` (URL assoluto), mentre `config/site.config.js` usa ormai `heroImage: { album, name }`. Due modi diversi di indicare una foto nello stesso `config/`.

---

## File Structure

| File | Responsabilità |
|---|---|
| `src/utils/decideMigration.js` | nuovo: funzione pura che decide se `migrate` può procedere |
| `src/utils/decideMigration.test.js` | nuovo |
| `scripts/migrate.js` | interroga R2 e applica la decisione; `--force` per forzare |
| `config/albums.config.js` | `coverUrl` → `coverName` |
| `scripts/migrate.test.js` | adegua `albumsToRuntime` |
| `README.md` | riscritto per R2 + Worker + dashboard |
| `CUSTOMIZING.md` | riscritto da zero |

---

### Task 1: Guardia contro la sovrascrittura

`migrate` è un comando di bootstrap: trasforma il seed dei file nei JSON su R2, **una volta sola**. Dopo, la verità è la dashboard. Oggi nulla lo dice e nulla lo impedisce.

**Files:**
- Create: `src/utils/decideMigration.js`, `src/utils/decideMigration.test.js`
- Modify: `scripts/migrate.js`

**Interfaces:**
- Consumes: niente
- Produces: `decideMigration(chiaviEsistenti, force) → { procedi: boolean, messaggio: string }`

- [ ] **Step 1: Creare il branch**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git checkout main && git pull --ff-only
git checkout -b punto3-documentazione
```

- [ ] **Step 2: Scrivere il test che fallisce**

`src/utils/decideMigration.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { decideMigration } from './decideMigration.js';

describe('decideMigration', () => {
  it('procede quando su R2 non c e nulla', () => {
    const d = decideMigration([], false);
    expect(d.procedi).toBe(true);
  });

  it('si ferma quando i dati esistono gia', () => {
    const d = decideMigration(['_site/site.json'], false);
    expect(d.procedi).toBe(false);
  });

  it('dice quali chiavi ha trovato, per non lasciare indovinare', () => {
    const d = decideMigration(['_site/site.json', '_data/albums.json'], false);
    expect(d.messaggio).toContain('_site/site.json');
    expect(d.messaggio).toContain('_data/albums.json');
  });

  it('spiega come forzare, ma avverte di cosa si perde', () => {
    const d = decideMigration(['_site/site.json'], false);
    expect(d.messaggio).toContain('--force');
    expect(d.messaggio).toMatch(/dashboard/i);
  });

  it('con --force procede e avverte che sta sovrascrivendo', () => {
    const d = decideMigration(['_site/site.json'], true);
    expect(d.procedi).toBe(true);
    expect(d.messaggio).toMatch(/sovrascriv/i);
  });

  it('con --force ma niente da sovrascrivere non allarma', () => {
    const d = decideMigration([], true);
    expect(d.procedi).toBe(true);
    expect(d.messaggio).not.toMatch(/sovrascriv/i);
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca**

Run: `npx vitest run src/utils/decideMigration.test.js`
Atteso: FAIL, `Failed to resolve import "./decideMigration.js"`.

- [ ] **Step 4: Implementare**

`src/utils/decideMigration.js`:

```js
/**
 * Decide se `migrate` puo' scrivere su R2. Migrate e' un comando di
 * bootstrap: trasforma il seed di config/ nei JSON runtime una volta sola.
 * Dopo, la verita' e' cio' che la dashboard ha scritto, e rilanciarlo
 * significherebbe riportare indietro nome, bio, hero e album al seed.
 *
 * @param {string[]} chiaviEsistenti - chiavi gia' presenti sul bucket
 * @param {boolean} force - l'utente ha passato --force
 * @returns {{procedi: boolean, messaggio: string}}
 */
export function decideMigration(chiaviEsistenti, force) {
  if (chiaviEsistenti.length === 0) {
    return { procedi: true, messaggio: '' };
  }

  const elenco = chiaviEsistenti.join(', ');

  if (force) {
    return {
      procedi: true,
      messaggio: `--force: sovrascrivo ${elenco}.`,
    };
  }

  return {
    procedi: false,
    messaggio:
      `Su R2 esistono gia': ${elenco}.\n` +
      'migrate serve a inizializzare il sito una volta sola. Se lo rilanci ora ' +
      'riporti nome, bio, hero e album ai valori dei file in config/, ' +
      'cancellando quello che hai fatto dalla dashboard.\n' +
      'Se e\' davvero cio\' che vuoi: npm run migrate -- --force',
  };
}
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `npx vitest run src/utils/decideMigration.test.js`
Atteso: 6 test PASS.

- [ ] **Step 6: Collegare la guardia a `migrate.js`**

In `scripts/migrate.js`: aggiungere `HeadObjectCommand` all'import da `@aws-sdk/client-s3`, importare `decideMigration`, e inserire il controllo **dopo** la creazione del client S3 e **prima** del ciclo di `PutObjectCommand`:

```js
  const force = process.argv.includes('--force');
  const chiavi = ['_site/site.json', '_data/albums.json'];

  const esistenti = [];
  for (const key of chiavi) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
      esistenti.push(key);
    } catch (err) {
      // 404/NotFound = la chiave non c'e', ed e' il caso normale al primo giro.
      // Qualunque altro errore (permessi, rete, bucket sbagliato) non va
      // scambiato per "non esiste": meglio fermarsi che sovrascrivere al buio.
      const code = err?.$metadata?.httpStatusCode;
      if (code !== 404 && err?.name !== 'NotFound') throw err;
    }
  }

  const decisione = decideMigration(esistenti, force);
  if (decisione.messaggio) process.stdout.write(`${decisione.messaggio}\n`);
  if (!decisione.procedi) process.exit(1);
```

Aggiornare anche il commento d'uso in cima al file, aggiungendo la riga di `--force`.

- [ ] **Step 7: Verificare che nulla si sia rotto**

```bash
npm test
```

Atteso: tutti verdi. Il totale è 281 + 6 = **287**. Se non torna, riferire il numero senza aggiustare i test.

**Non eseguire `npm run migrate`**: scriverebbe su un bucket vero. La logica è coperta dai test della funzione pura.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(migrate): rifiuta di sovrascrivere dati gia' presenti su R2

migrate e' un comando di bootstrap: trasforma il seed di config/ nei
JSON runtime una volta sola, e da li' in poi la verita' e' cio' che la
dashboard ha scritto. Finora nulla lo diceva e nulla lo impediva:
rilanciarlo riportava nome, bio, hero e album al seed, cancellando in
silenzio il lavoro fatto dalla dashboard.

Ora controlla se le chiavi esistono e si ferma spiegando cosa perderebbe,
con --force per chi lo vuole davvero.

Un HeadObject che fallisce per motivi diversi da 404 non viene scambiato
per "non esiste": con permessi mancanti o bucket sbagliato e' meglio
fermarsi che sovrascrivere al buio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Un solo modo di indicare una foto nel seed

`site.config.js` usa `heroImage: { album, name }`; `albums.config.js` chiede ancora un URL assoluto in `coverUrl`, da cui `migrate` estrae l'ultimo segmento. Due convenzioni diverse nella stessa cartella: chi compila il template deve ricordarsi quale vale dove.

**Files:**
- Modify: `config/albums.config.js`, `scripts/migrate.js`, `scripts/migrate.test.js`

**Interfaces:**
- Consumes: niente
- Produces: `albumsToRuntime` legge `coverName` direttamente

- [ ] **Step 1: Aggiornare il test di `albumsToRuntime`**

In `scripts/migrate.test.js`, nei casi che riguardano `albumsToRuntime`, sostituire gli input `coverUrl: 'https://pub-xxx.r2.dev/slug/foto.webp'` con `coverName: 'foto.webp'`, lasciando invariate le asserzioni sul risultato (`coverName: 'foto.webp'`). Aggiungere un caso:

```js
  it('coverName assente diventa null', () => {
    const out = albumsToRuntime([{ slug: 'a', title: 'A', description: '' }]);
    expect(out.albums[0].coverName).toBeNull();
  });
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx vitest run scripts/migrate.test.js`
Atteso: FAIL — `albumsToRuntime` cerca ancora `coverUrl` e restituisce `null` dove il test si aspetta `foto.webp`.

- [ ] **Step 3: Implementare**

In `scripts/migrate.js`, sostituire la riga di `coverName` dentro `albumsToRuntime`:

```js
      coverName: a.coverName ?? null,
```

- [ ] **Step 4: Aggiornare il seed**

In `config/albums.config.js`, sostituire il campo `coverUrl` con:

```js
    coverName: '',  // nome del file della copertina dentro l'album, es. 'copertina.webp'
```

e allineare il commento in testa al file, se cita gli URL.

- [ ] **Step 5: Eseguire i test**

Run: `npm test`
Atteso: tutti verdi, totale **288** (287 + 1). Riferire il numero se differisce.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -F - <<'EOF'
refactor(config): la cover si indica col nome del file, non con un URL

config/ aveva due convenzioni per indicare una foto: heroImage con
{ album, name } e coverUrl con un URL assoluto, da cui migrate estraeva
l'ultimo segmento. Chi compila il template doveva ricordarsi quale
valeva dove, e l'URL conteneva anche il dominio, cioe' proprio cio' che
il punto 2 ha tolto da ogni altra parte.

Ora e' coverName, e l'album e' gia' dato dallo slug.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: README riscritto

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: il runbook del punto 1
- Produces: documentazione

- [ ] **Step 1: Verificare cosa c'è da togliere**

```bash
grep -n -i 'drive\|86 test\|superate' README.md
```

Serve a vedere l'elenco completo prima di riscrivere, così non ne resta qualcuno.

- [ ] **Step 2: Riscrivere**

Struttura da produrre, **conservando invariata la sezione "Come partire, e come restare aggiornati"** sul fork, che è già corretta:

1. **Titolo e una frase** su cos'è: portfolio fotografico multipagina su Cloudflare Workers, foto su R2, caricate da una dashboard protetta da Cloudflare Access. Nessun database.
2. **Come partire, e come restare aggiornati** — invariata.
3. **Quick start**: `node --version` (v20+), `npm install`, compilare `wrangler.json` e `.env`, `npm run dev`, `ALLOW_PLACEHOLDER_CSP=1 npm run build` per provare la build prima di avere valori veri, `npm test`. **Il numero di test va letto da `npm test`, non copiato da questo piano.**
4. **Setup di un nuovo portfolio**, in ordine reale: creare l'infrastruttura (rimandando al [runbook](docs/runbook-cloudflare.md), senza duplicarne i passi); compilare `wrangler.json` a mano o con `npm run infra:sync`; `.env` per le chiavi R2 di `migrate` e la chiave Web3Forms; seed in `config/` più `npm run migrate` **una volta sola**; collegare la Git integration.
5. **Come si usa il sito una volta online**: `/admin` per caricare foto e modificare identità e album. La dashboard è la via normale; `config/` è solo il seed.
6. **Personalizzazione** — rimando a `CUSTOMIZING.md`.
7. **Struttura del progetto**: cosa c'è in `config/`, `theme/`, `src/`, `infra/`, `scripts/`, `docs/`, una riga per cartella.

**Togliere** l'avviso provvisorio "le istruzioni qui sotto sono superate": dopo questa riscrittura non ha più oggetto.

- [ ] **Step 3: Verificare che non resti nulla dell'era Drive**

```bash
grep -c -i 'drive' README.md
```

Atteso: `0`.

Poi controllare che ogni comando citato esista davvero:

```bash
node -e "const s=require('./package.json').scripts; const m=require('fs').readFileSync('README.md','utf8').match(/npm run [a-z:-]+/g)||[]; const mancanti=[...new Set(m)].map(x=>x.replace('npm run ','')).filter(n=>!s[n]); console.log(mancanti.length? 'INESISTENTI: '+mancanti : 'tutti gli npm run citati esistono')"
```

Atteso: `tutti gli npm run citati esistono`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -F - <<'EOF'
docs: riscrivi il README per l'architettura reale

Descriveva Google Drive, VITE_DRIVE_API_KEY e "86 test": un setup che
non porta da nessuna parte, in un repo che sta per essere dato ad altri.
Rimosso anche l'avviso provvisorio messo nel bootstrap, che ora non ha
piu' oggetto.

Conservata invariata la sezione sul fork, che era gia' corretta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: `CUSTOMIZING.md` riscritto

È il documento che l'analisi chiama *"l'API di personalizzazione"*: la mappa di cosa toccare per ogni tipo di modifica. Oggi descrive Google Drive.

**Files:**
- Modify: `CUSTOMIZING.md`

**Interfaces:**
- Consumes: la struttura reale di `config/`, `theme/`, `infra/`
- Produces: documentazione

- [ ] **Step 1: Aprire il documento con la distinzione che spiega tutto**

Va in cima, prima di ogni istruzione, perché è ciò che confonde chiunque arrivi nuovo (analisi §4.2):

- **Contenuto** — nome, bio, hero, album, foto: a runtime la verità è **R2**, e si modifica dalla **dashboard** `/admin`. I file in `config/site.config.js` e `config/albums.config.js` sono solo il **seed iniziale**, usato da `npm run migrate` una volta sola.
- **Aspetto e testi di interfaccia** — colori, font, spaziature, copy: la verità sono i **file**, `theme/` e `config/texts.config.js`. Valgono anche per la dashboard, che importa gli stessi token.
- **Infrastruttura** — bucket, domini, Access: `infra/*.tf` e `wrangler.json`.

Aggiungere l'avvertenza su `migrate` in grassetto: rilanciarlo dopo aver usato la dashboard riporta i contenuti al seed. Dal Task 1 il comando si rifiuta di farlo senza `--force`, ma chi legge deve sapere perché.

- [ ] **Step 2: Scrivere la tabella "voglio cambiare X, tocco Y"**

Una riga per ogni modifica che qualcuno vorrà davvero fare. Coprire almeno:

| Voglio cambiare | Dove |
|---|---|
| Nome, bio, link social | dashboard `/admin` (oppure `config/site.config.js` prima del primo `migrate`) |
| Foto di copertina della home | dashboard, sezione Sito, selettore hero |
| Aggiungere o togliere un album | dashboard |
| Caricare, riordinare, eliminare foto | dashboard, vista album |
| Colori | `theme/tokens.css`, variabili `--color-*` |
| Font | `theme/tokens.css` (`--font-*`) e `theme/typography.css`; aggiornare i `<link>` Google Fonts negli HTML |
| Spaziature, raggi dei bordi | `theme/tokens.css` |
| Testi fissi dell'interfaccia | `config/texts.config.js` |
| Sfondo della dashboard | `config/admin.config.js` |
| Chi può entrare in `/admin` | `infra/variables.tf`, `admin_emails`, poi `terraform apply` |
| Dominio delle foto | `infra/terraform.tfvars`, `custom_photo_domain` (vedi runbook sezione 8) |
| Intestazioni di sicurezza / CSP | **niente**: si genera da `wrangler.json` durante la build |

- [ ] **Step 3: Aggiungere le due sezioni che evitano guai**

- **Cosa non va toccato per personalizzare**: `src/` è comportamento. Chi lo modifica avrà conflitti ai futuri `git merge upstream/main`. Tenere le proprie modifiche in `config/` e `theme/` è ciò che rende indolori gli aggiornamenti.
- **Dopo ogni modifica ai file**: `npm test && npm run build`, poi commit e push — il deploy parte da solo con la Git integration. Le modifiche fatte dalla dashboard, invece, sono già online e non richiedono deploy.

- [ ] **Step 4: Verificare**

```bash
grep -c -i 'drive' CUSTOMIZING.md
```

Atteso: `0`.

Poi controllare che ogni file citato esista davvero:

```bash
node -e "const fs=require('fs'); const t=fs.readFileSync('CUSTOMIZING.md','utf8'); const p=[...new Set((t.match(/\`(config|theme|src|infra|scripts)\/[A-Za-z0-9_.\/-]+\`/g)||[]).map(s=>s.replace(/\`/g,'')))]; const mancanti=p.filter(f=>!fs.existsSync(f)); console.log(mancanti.length? 'CITATI MA INESISTENTI: '+mancanti.join(', ') : 'tutti i file citati esistono')"
```

Atteso: `tutti i file citati esistono`.

- [ ] **Step 5: Commit**

```bash
git add CUSTOMIZING.md
git commit -F - <<'EOF'
docs: riscrivi CUSTOMIZING.md per l'architettura R2 e la dashboard

Era rimasto all'era Google Drive: driveApiKey, driveFolderId, URL
lh3.googleusercontent.com. E' il documento che l'analisi chiama "l'API
di personalizzazione", quindi era anche il piu' dannoso da lasciare
sbagliato.

Si apre con la distinzione che confonde tutti: il contenuto vive su R2
e si cambia dalla dashboard, mentre aspetto e testi vivono nei file.
Segue la tabella "voglio cambiare X, tocco Y", e l'avvertenza che
toccare src/ produce conflitti ai futuri merge dal template.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5 [UMANO]: Prova generale

La roadmap originale (Fase 8) fissava una verifica che nessun test automatico può sostituire: **creare un sito da zero partendo dal template e cronometrare**. Obiettivo dichiarato allora: meno di 30 minuti.

- [ ] **Step 1: Forkare il template** con un altro account, o clonarlo in una cartella nuova ripuntando `origin`, come dice il README.

- [ ] **Step 2: Seguire il README alla lettera**, senza usare ciò che sai a memoria. Ogni volta che ti fermi a pensare "qui però bisogna anche...", quello è un buco nella documentazione: annotalo invece di colmarlo con la tua testa.

- [ ] **Step 3: Annotare i tempi** delle tre fasi: infrastruttura, configurazione, primo deploy.

- [ ] **Step 4: Riportare i buchi trovati** in [azioni-manuali](../../azioni-manuali.md), da correggere prima di dare il repo agli amici.

È anche l'occasione naturale per la voce 7 (`terraform apply`): un'infrastruttura nuova, creata da zero, senza l'insidia degli `import` delle risorse già esistenti.

---

## Self-Review

**Copertura della spec.** Punto 1 dell'audit di luglio (`CUSTOMIZING.md` stantio) → Task 4. Punto 4 dell'audit (runbook) → già fatto nel punto 1, qui solo richiamato senza duplicarlo. Ordine dei lavori §7 punto 3 (`CUSTOMIZING.md` + guardia `migrate` + README) → Task 1, 3 e 4. §4.2 (contenuto vs aspetto) → Task 4 Step 1. La prova generale della roadmap Fase 8 → Task 5.

**Segnaposto.** Nessun TBD. README e `CUSTOMIZING.md` sono dati come struttura con il contenuto di ogni sezione e la tabella completa: è prosa da scrivere leggendo i file veri, e anticiparla riga per riga qui significherebbe scriverla due volte e farla divergere. Le verifiche degli Step 3 e 4 sono automatiche proprio perché il contenuto è prosa: controllano che non resti nulla di Drive e che ogni file e comando citato esista davvero.

**Coerenza dei nomi.** `coverName` sostituisce `coverUrl` in `config/albums.config.js` e in `albumsToRuntime`, entrambi nel Task 2. `decideMigration` ha la stessa firma nel Task 1 Step 4 e nello Step 6.

**Un rischio dichiarato.** I Task 3 e 4 sono gli unici di tutto il progetto il cui esito non è verificabile da un test: che la documentazione sia *giusta* lo dice solo qualcuno che la segue senza sapere già le risposte. È esattamente ciò che fa il Task 5, ed è il motivo per cui esiste.
