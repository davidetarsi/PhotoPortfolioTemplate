# Punto 4 — Centralizzazione della personalizzazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere vera la promessa del template — che si personalizzi toccando solo `config/` e `theme/` — oggi smentita da colori scolpiti nel CSS strutturale e da una dashboard con i testi in italiano dentro il JavaScript.

**Architecture:** Quattro interventi indipendenti. Un helper per i testi con segnaposto, così `config/texts.config.js` resta dati puri. Le stringhe della dashboard spostate sotto `texts.admin.*`. I colori letterali di `src/styles/` sostituiti da token, che è il punto in cui la promessa del theming oggi si rompe. Infine tre varianti di card, derivate dai mockup esistenti e selezionabili con una riga in `theme/`, senza un solo ramo condizionale nel JavaScript.

**Tech Stack:** Node 20+, Vite 8, vitest, CSS custom properties.

**Spec:** [analisi §4](../specs/2026-09-20-template-distribuibile-analisi.md), in particolare §4.3 e la decisione §8 punto 5. La DoD originale sui colori è in [piano-implementazione.md](../../../piano-implementazione.md), M2.3.

## Global Constraints

Dal `CLAUDE.md` di `/srv/claude/workspaces/`:

- **Mai `git push --force`**, mai cancellare rami remoti, mai `--no-verify`. Push bloccato → fermarsi e segnalare.
- **Mai committare su `main`.** Branch dedicato e PR; il merge lo decide una persona.
- Si lavora solo dentro `/srv/claude/workspaces/`. Ogni file cancellato va dichiarato, con il motivo.
- **Non leggere, copiare o stampare credenziali.** In questo punto non ne serve nessuna.
- Identità commit `VPS Agent <agent@vps-agent.invalid>`, già globale.

Ogni commit termina con:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Vincoli tecnici:

- **Mai `npm run migrate`**, nemmeno con `--dry-run`. **Mai `terraform apply` o `plan`.**
- `npm run build` da solo fallisce di proposito: usare `ALLOW_PLACEHOLDER_CSP=1 npm run build`.
- Branch: `punto4-personalizzazione`, creato da `main` **dopo** il merge della PR del punto 3. Se `src/utils/decideMigration.js` non esiste su `main`, fermarsi e segnalare.
- Test di partenza: **291**.

## Stato di partenza verificato

Verificato sul codice il 2026-09-20:

- `#2e3235` compare **10 volte** in `src/styles/` (9 in `admin.css`, 1 in `album-card.css`, 1 in `photo-grid.css`), e `rgba(16, 17, 18, …)` — la forma letterale di `--color-bg` — altre 3 volte. La DoD M2.3 chiedeva che un `grep` di esadecimali in `src/styles/` non trovasse nulla.
- Le stringhe della dashboard sono ~27, in `views/home.js`, `views/album.js`, `status.js`, `preview.js`, `album-creation.js`.
- `config/texts.config.js` contiene `album.error.forbidden` — *"Cartella non accessibile. Verifica che sia condivisa pubblicamente"* — linguaggio dell'era Google Drive, **e nessun file in `src/` la usa**.
- Il locale delle date è `'it-IT'` scolpito, mentre `siteConfig.language` esiste già.
- `src/styles/album-card.css` **è già la variante cinematic**: overlay con gradiente, `aspect-ratio: 4/5`, zoom allo hover.
- Il DOM di `createAlbumCard` — `<a>` con `__cover`, `__img`, `__info`, `__title`, `__desc` — regge tutte e tre le varianti senza modifiche.

---

## File Structure

| File | Responsabilità |
|---|---|
| `src/utils/formatText.js` | nuovo: sostituisce `{segnaposto}` nei testi |
| `src/utils/formatText.test.js` | nuovo |
| `config/texts.config.js` | perde la stringa morta, guadagna la sezione `admin` |
| `src/admin/**` | leggono i testi da `texts.admin.*` |
| `theme/tokens.css` | nuovi token di bordo e velatura |
| `src/styles/*.css` | solo `var(--…)`, nessun colore letterale |
| `src/styles/album-card.css` | solo la base condivisa dalle varianti |
| `src/styles/card-variants/{cinematic,editoriale,minimal}.css` | nuovi |
| `theme/card.css` | nuovo: la riga che sceglie la variante |
| `src/components/AlbumCard.js` | importa base e variante; **nessun ramo** |

---

### Task 1: Helper per i testi con segnaposto, e pulizia

Alcune stringhe della dashboard contengono valori interpolati. Perché `config/texts.config.js` resti dati puri — leggibile e traducibile senza scrivere JavaScript — servono segnaposto e una funzione che li sostituisca.

**Files:**
- Create: `src/utils/formatText.js`, `src/utils/formatText.test.js`
- Modify: `config/texts.config.js`

**Interfaces:**
- Consumes: niente
- Produces: `formatText(template, valori) → string`, usata dal Task 2

- [ ] **Step 1: Creare il branch**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git checkout main && git pull --ff-only
test -f src/utils/decideMigration.js || { echo "STOP: il punto 3 non e' su main"; exit 1; }
git checkout -b punto4-personalizzazione
```

- [ ] **Step 2: Scrivere il test che fallisce**

`src/utils/formatText.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { formatText } from './formatText.js';

describe('formatText', () => {
  it('sostituisce un segnaposto', () => {
    expect(formatText('Eliminare {nome}?', { nome: 'foto.webp' }))
      .toBe('Eliminare foto.webp?');
  });

  it('sostituisce lo stesso segnaposto piu volte', () => {
    expect(formatText('{a} e ancora {a}', { a: 'x' })).toBe('x e ancora x');
  });

  it('lascia intatto un segnaposto senza valore, invece di scrivere undefined', () => {
    expect(formatText('Ciao {nome}', {})).toBe('Ciao {nome}');
  });

  it('accetta numeri', () => {
    expect(formatText('Caricate {n} foto.', { n: 3 })).toBe('Caricate 3 foto.');
  });

  it('senza segnaposto restituisce il testo tale e quale', () => {
    expect(formatText('Album salvato.', {})).toBe('Album salvato.');
  });

  it('non interpreta il valore come segnaposto a sua volta', () => {
    expect(formatText('{a}', { a: '{b}', b: 'x' })).toBe('{b}');
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca**

Run: `npx vitest run src/utils/formatText.test.js`
Atteso: FAIL, `Failed to resolve import "./formatText.js"`.

- [ ] **Step 4: Implementare**

`src/utils/formatText.js`:

```js
/**
 * Sostituisce i segnaposto {nome} con i valori dati. Serve a tenere
 * config/texts.config.js come dati puri: chi traduce o riscrive i testi
 * non deve scrivere JavaScript.
 *
 * Una sola passata sulla stringa: i valori sostituiti non vengono
 * riesaminati, quindi un testo che contiene {altro} resta com'e'.
 *
 * @param {string} template
 * @param {Record<string, string|number>} valori
 * @returns {string}
 */
export function formatText(template, valori = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (intero, chiave) =>
    chiave in valori ? String(valori[chiave]) : intero,
  );
}
```

- [ ] **Step 5: Eseguire e verificare che passino**

Run: `npx vitest run src/utils/formatText.test.js`
Atteso: 6 test PASS.

- [ ] **Step 6: Rimuovere la stringa morta**

In `config/texts.config.js`, cancellare la riga `forbidden: 'Cartella non accessibile. Verifica che sia condivisa pubblicamente.',` dentro `album.error`.

Prima di cancellarla, **verificare che sia davvero inutilizzata**:

```bash
grep -rn "forbidden" src/ --include=*.js | grep -v '\.test\.'
```

Atteso: nessun risultato. Se invece compare, **non cancellarla**: va riscritta per l'architettura R2, e va riferito il punto in cui è usata.

Va dichiarato nel commit: la stringa parla di cartelle Drive condivise, architettura che non esiste più, e nessuno la legge.

- [ ] **Step 7: Verificare e committare**

```bash
npm test
```

Atteso: 291 + 6 = **297**. Riferire il numero se differisce.

```bash
git add -A
git commit -F - <<'EOF'
feat(texts): helper per i segnaposto, e via una stringa morta

Alcune stringhe della dashboard interpolano valori. Con un helper a
segnaposto, config/texts.config.js resta dati puri: chi traduce o
riscrive i testi non deve scrivere JavaScript.

Rimossa album.error.forbidden: parlava di cartelle Google Drive
condivise, architettura che non esiste piu', e nessun file in src/ la
leggeva. Verificato con grep prima di cancellarla.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: I testi della dashboard in configurazione

Lavoro meccanico ma esteso. La dashboard è parte del template quanto il sito pubblico: oggi un fork non italiano non ha modo di tradurla senza mettere le mani nel JavaScript.

**Files:**
- Modify: `config/texts.config.js`, `src/admin/views/home.js`, `src/admin/views/album.js`, `src/admin/status.js`, `src/admin/preview.js`, `src/admin/album-creation.js`, e i rispettivi `.test.js` dove asseriscono su testi

**Interfaces:**
- Consumes: `formatText` dal Task 1
- Produces: la sezione `texts.admin` di `config/texts.config.js`

- [ ] **Step 1: Aggiungere la sezione `admin` a `config/texts.config.js`**

Seguendo lo stile annidato già in uso nel file:

```js
  admin: {
    site: {
      sectionTitle: 'Sito',
      nameLabel: 'Nome',
      bioLabel: 'Bio',
      instagramLabel: 'Instagram',
      save: 'Salva sito',
      saved: 'Sito salvato.',
      preview: 'Anteprima',
      previewClose: 'Chiudi',
      heroUpdated: 'Hero aggiornata.',
      heroReadError: 'Impossibile leggere le foto di questo album.',
    },
    albums: {
      sectionTitle: 'Album',
      create: 'Nuovo album',
      exists: 'Esiste gia un album "{slug}".',
      delete: 'Elimina',
      deleteNameMismatch: 'Nome non corrispondente: cancellazione annullata.',
    },
    album: {
      save: 'Salva',
      saved: 'Album salvato.',
      cover: 'Cover',
      coverSelected: 'Cover selezionata: {nome} (premi Salva per confermare).',
      date: 'Data',
      sortedByDate: 'Foto ordinate per data.',
      confirmDeletePhoto: 'Eliminare {nome}?',
      manifestError: 'Impossibile caricare il manifest.',
      unsavedChanges: 'Ci sono modifiche non salvate. Uscire comunque?',
      uploadProgress: '{nome} — {fase}',
    },
    status: {
      lastAction: 'Ultima azione eseguita',
      error: 'Errore',
    },
  },
```

Se durante il Task 2 emergono stringhe non previste da questo elenco, **aggiungerle** invece di lasciarle nel JavaScript, e riferirlo alla fine.

- [ ] **Step 2: Sostituire le stringhe nei file della dashboard**

In ciascuno dei cinque file, importare `texts` da `../../config/texts.config.js` (il percorso relativo corretto va verificato per ogni file) e, dove serve interpolazione, `formatText` da `../utils/formatText.js`.

**Non spostare** queste, che non sono testi dell'interfaccia:

- `'admin-dropzone--over'` e simili → sono **nomi di classi CSS**
- `'network'` in `preview.js` → è un **codice di errore** confrontato nel codice
- `'it-IT'` → è un **locale**, se ne occupa il Task 3

Spostare una di queste romperebbe il comportamento senza che nessun test lo dica necessariamente: è l'errore più facile di questo task.

- [ ] **Step 3: Verificare che non resti testo nel JavaScript**

```bash
grep -rnoE "'[A-ZÀ-Ù][a-zà-ù ]{4,}[.?]?'" src/admin/ --include=*.js | grep -v '\.test\.'
```

Atteso: nessun risultato, o solo casi che si è deciso consapevolmente di lasciare — da elencare nel report.

- [ ] **Step 4: Eseguire i test**

```bash
npm test
```

I test della dashboard che asseriscono su testi vanno aggiornati a leggerli da `texts.admin.*` invece di ripetere la stringa letterale: così un domani cambiare un testo non fa fallire i test. **È un adeguamento legittimo**, non un aggiustamento per far passare i conti — ma va spiegato nel report.

Atteso: tutti verdi, totale invariato a **297** (si spostano stringhe, non si aggiungono test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(admin): i testi della dashboard passano da texts.config.js

La dashboard e' parte del template quanto il sito pubblico, ma i suoi
testi erano in italiano dentro il JavaScript: un fork non italiano non
poteva tradurla senza mettere le mani in src/.

Lasciati dove sono i nomi di classe CSS, i codici di errore e il locale
delle date: non sono testi d'interfaccia, e spostarli avrebbe rotto il
comportamento in silenzio.

I test che asserivano su stringhe letterali ora leggono texts.admin.*,
cosi cambiare un testo non fa fallire i test.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: I colori tornano nei token

È il task che rende vera la promessa del template. Oggi `--color-bg` si può cambiare, ma bordi e velature restano quelli di un tema scuro: chi prova un tema chiaro ottiene un sito rotto, e non capisce perché.

**Files:**
- Modify: `theme/tokens.css`, `src/styles/admin.css`, `src/styles/album-card.css`, `src/styles/photo-grid.css`, `src/styles/hero.css`
- Modify: `src/pages/admin.js` o dove si formatta la data (vedi Step 4)

**Interfaces:**
- Consumes: niente
- Produces: i token `--color-border`, `--color-scrim`, `--color-overlay`, `--color-shimmer`

- [ ] **Step 1: Contare il debito, per poterlo verificare dopo**

```bash
grep -rc '#[0-9a-fA-F]\{3,6\}\b\|rgba(' src/styles/*.css
```

Annotare i numeri: servono al confronto dello Step 3.

- [ ] **Step 2: Aggiungere i token**

In `theme/tokens.css`, nella sezione dei colori:

```css
  /* Bordi e velature: stavano scolpiti in src/styles/, dove rendevano
     impossibile cambiare tema davvero. Qui si cambiano una volta sola. */
  --color-border: #2e3235;
  --color-shimmer: #2e3235;
  --color-scrim: rgba(16, 17, 18, 0.88);
  --color-overlay: rgba(0, 0, 0, 0.75);
  --color-overlay-soft: rgba(0, 0, 0, 0.65);
```

- [ ] **Step 3: Sostituire ogni occorrenza**

In `src/styles/`: ogni `#2e3235` diventa `var(--color-border)` — tranne quello dentro l'animazione shimmer, che diventa `var(--color-shimmer)`. Ogni `rgba(16, 17, 18, …)` diventa `var(--color-scrim)`, ogni `rgba(0, 0, 0, 0.75)` diventa `var(--color-overlay)`, ogni `rgba(0, 0, 0, 0.65)` e `rgba(0,0,0,0.6)` diventa `var(--color-overlay-soft)`.

Verificare:

```bash
grep -rn '#[0-9a-fA-F]\{3,6\}\b\|rgba(' src/styles/*.css || echo "PULITO: nessun colore letterale in src/styles"
```

Atteso: `PULITO`. È la DoD M2.3, finalmente soddisfatta.

- [ ] **Step 4: Il locale delle date dalla configurazione**

`toLocaleDateString('it-IT', …)` è scolpito. Sostituirlo con `siteConfig.language`, che esiste già ed è `'it'`. Trovare le occorrenze con:

```bash
grep -rn "it-IT" src/ --include=*.js | grep -v '\.test\.'
```

Dove si formatta, passare `siteConfig.language || 'it'`. Un test esistente potrebbe dipendere dal formato italiano: se cambia, adeguarlo e spiegarlo.

- [ ] **Step 5: Verificare che l'aspetto non sia cambiato**

```bash
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build
```

I valori dei token sono **identici** a quelli che sostituiscono, quindi il sito deve apparire esattamente come prima. Questo task non cambia l'aspetto: cambia *dove* si decide.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -F - <<'EOF'
fix(theme): i colori tornano nei token, il tema diventa davvero cambiabile

#2e3235 compariva 10 volte in src/styles/ e rgba(16,17,18,...) altre 3:
la forma letterale di --color-bg. Il template prometteva che si cambia
tema toccando theme/, ma chi ci provava otteneva bordi e velature
rimasti scuri, senza capire perche'. La DoD M2.3 lo vietava fin
dall'inizio.

I valori dei nuovi token sono identici a quelli sostituiti: l'aspetto
non cambia, cambia dove si decide.

Il locale delle date non e' piu' 'it-IT' scolpito ma siteConfig.language.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Tre varianti di card

Derivate dai mockup esistenti. **Solo CSS**: se una variante sembra richiedere un DOM diverso, è il segnale che stiamo scivolando verso il sistema generico che l'analisi §4.4 ha scartato — fermarsi e riferire.

**Files:**
- Modify: `src/styles/album-card.css` (resta la sola base), `src/components/AlbumCard.js` (un import in più)
- Create: `src/styles/card-variants/cinematic.css`, `editoriale.css`, `minimal.css`, `theme/card.css`

**Interfaces:**
- Consumes: i token del Task 3
- Produces: `theme/card.css`, il file dove chi usa il template sceglie

- [ ] **Step 1: Separare base e variante**

In `src/styles/album-card.css` **restano**: `.album-cards` (la griglia), il reset del link `.album-card`, `.album-card__img` con `object-fit`, il blocco `prefers-reduced-motion`, `.album-card__skeleton` con la sua animazione, `.page-error`.

**Si spostano** nella variante `cinematic.css`, perché sono scelte estetiche: `aspect-ratio`, `border-radius`, `background` della card, il posizionamento assoluto di `__cover` e `__info`, il gradiente, lo zoom allo hover, e la tipografia di `__title` e `__desc`.

- [ ] **Step 2: Scrivere `cinematic.css`**

`src/styles/card-variants/cinematic.css` — è l'aspetto attuale, spostato senza modifiche: card 4/5, immagine a pieno riquadro, testo sopra un gradiente in basso, zoom lieve allo hover, angoli arrotondati.

- [ ] **Step 3: Scrivere `minimal.css`**

Derivata da `mockups/mockup-4-minimal.html`: nessun riquadro, nessun arrotondamento, nessuno sfondo. L'immagine a piena larghezza con proporzione naturale, il testo **sotto** e centrato, molto respiro.

```css
/* Derivata da mockups/mockup-4-minimal.html: nessun riquadro, il testo
   sotto l'immagine, molta aria. Niente overlay: l'immagine resta intera. */
.album-card {
  display: block;
  aspect-ratio: auto;
  background: none;
  border-radius: 0;
  text-align: center;
}

.album-card__cover { position: static; }

.album-card__img { height: auto; }

.album-card__info { position: static; padding: var(--space-md) 0 0; background: none; }

.album-card__title {
  font-family: var(--font-heading);
  font-style: italic;
  font-weight: 400;
  font-size: 1.05rem;
  margin: 0;
}

.album-card__desc {
  font-size: 0.7rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--color-muted);
  margin: 6px 0 0;
}

.album-cards { gap: var(--space-xl); }
```

- [ ] **Step 4: Scrivere `editoriale.css`**

Derivata da `mockups/mockup-3-editoriale.html`: impianto orizzontale, immagine a sinistra e testo a destra, titolo in maiuscolo stretto, riga di meta in colore d'accento, separatore sotto ogni voce, nessun arrotondamento.

```css
/* Derivata da mockups/mockup-3-editoriale.html: impianto da rivista,
   immagine e testo affiancati, filetto di separazione, niente riquadri. */
.album-cards { grid-template-columns: 1fr; gap: 0; }

.album-card {
  display: grid;
  grid-template-columns: minmax(120px, 30%) 1fr;
  gap: var(--space-lg);
  align-items: start;
  aspect-ratio: auto;
  background: none;
  border-radius: 0;
  border-bottom: 1px solid var(--color-border);
  padding: var(--space-lg) 0;
}

.album-card__cover { position: static; aspect-ratio: 4 / 3; }

.album-card__img { height: 100%; }

.album-card__info { position: static; padding: 0; background: none; }

.album-card__title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.6rem;
  text-transform: uppercase;
  line-height: 1.05;
  margin: 0;
}

.album-card__desc {
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin: 6px 0 0;
}

@media (max-width: 600px) {
  .album-card { grid-template-columns: 1fr; gap: var(--space-md); }
}
```

- [ ] **Step 5: Il file dove si sceglie**

`theme/card.css`:

```css
/* Variante delle card degli album. Scegline UNA sola: lascia attiva la
   riga che vuoi e commenta le altre.
   Le tre varianti differiscono solo per CSS, sullo stesso HTML. */

@import '../src/styles/card-variants/cinematic.css';
/* @import '../src/styles/card-variants/editoriale.css'; */
/* @import '../src/styles/card-variants/minimal.css'; */
```

In `src/components/AlbumCard.js`, aggiungere la seconda riga di import subito sotto la prima:

```js
import '../styles/album-card.css';
import '../../theme/card.css';
```

Due import fissi, nessuna condizione: la scelta vive interamente in `theme/card.css`.

- [ ] **Step 6: Verificare che tutte e tre compilino**

Per ciascuna variante, attivarla in `theme/card.css` e ricostruire:

```bash
npm test && ALLOW_PLACEHOLDER_CSP=1 npm run build && echo "variante ok"
```

Atteso: tre build riuscite. **Rimettere `cinematic` attiva alla fine**, che è il default del template.

- [ ] **Step 7: Documentare in `CUSTOMIZING.md`**

Aggiungere una riga alla tabella "Voglio cambiare X, tocco Y":

| **Aspetto delle card degli album** | `theme/card.css`: attiva una delle tre `@import` | `cinematic` (default), `editoriale`, `minimal`. Solo CSS, stesso HTML. |

E una breve sezione che descrive le tre, una frase ciascuna, dicendo da quale mockup derivano.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(theme): tre varianti di card selezionabili da theme/card.css

cinematic (l'attuale, testo su gradiente), editoriale (impianto da
rivista, immagine e testo affiancati) e minimal (nessun riquadro, testo
sotto l'immagine), derivate dai mockup gia' nel repo.

Differiscono solo per CSS, sullo stesso HTML: AlbumCard.js ha due
import fissi e nessuna condizione. Chi usa il template sceglie
commentando una riga in theme/card.css. Non e' un sistema generico di
theming, ed e' una scelta: l'analisi §4.4 l'ha scartato perche'
moltiplica le combinazioni da testare e chi clona preferisce il CSS.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5 [UMANO]: Guardarle

Nessun test può dire se una card è bella. Questo è l'unico modo.

- [ ] **Step 1:** `npm run dev`, aprire la home, e cambiare la riga attiva in `theme/card.css` una variante alla volta. Il dev server ricarica da solo.

- [ ] **Step 2:** Guardarle anche da telefono, o con la finestra stretta: `editoriale` passa a colonna singola sotto i 600px, `minimal` diventa molto alta perché conserva le proporzioni originali delle foto.

- [ ] **Step 3:** Decidere quale resta il **default del template**. Ora è `cinematic` perché era l'aspetto esistente, non perché sia stata scelta.

- [ ] **Step 4:** Se una non convince, dirlo: sono tre file CSS indipendenti, si correggono o si eliminano senza toccare altro.

---

## Self-Review

**Copertura della spec.** §4.3 punto 1 (stringhe admin) → Task 2. §4.3 punto 2 e decisione §8 punto 5 (tre varianti dai mockup, solo CSS) → Task 4. §4.2 (contenuto vs aspetto) → rispettata: i testi UI restano file, e `theme/card.css` è aspetto. DoD M2.3 del piano originale (nessun esadecimale in `src/styles/`) → Task 3, mai soddisfatta prima d'ora.

**Segnaposto.** Nessun TBD. Il CSS delle due varianti nuove è dato per esteso; quello di `cinematic` no, ed è deliberato: è codice che **esiste già** in `album-card.css` e va spostato, non riscritto — copiarlo qui significherebbe crearne una seconda copia destinata a divergere.

**Coerenza dei nomi.** `formatText` ha la stessa firma nei Task 1 e 2. I token `--color-border`, `--color-shimmer`, `--color-scrim`, `--color-overlay`, `--color-overlay-soft` sono definiti nel Task 3 Step 2 e usati negli Step 3 e nel Task 4. Le tre varianti si chiamano `cinematic`, `editoriale`, `minimal` ovunque: file, `@import`, documentazione.

**Un rischio dichiarato.** Il Task 2 è il più facile da sbagliare in silenzio: fra le stringhe della dashboard ce ne sono che *sembrano* testo ma sono nomi di classi CSS e codici di errore. Spostarle romperebbe il comportamento senza che nessun test lo segnali per forza. Per questo lo Step 2 le elenca una per una.

**Una cosa che questo piano non fa.** Non tocca l'anteprima della dashboard né il modello di salvataggio: restano come decisi in §5, rimandati in attesa del feedback dei primi utilizzatori.
