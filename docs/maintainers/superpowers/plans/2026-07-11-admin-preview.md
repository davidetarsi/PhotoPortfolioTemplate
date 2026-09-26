# Tasto Anteprima Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tasto "Anteprima" nel form Sito dell'admin dashboard che mostra nome/bio/Instagram come apparirebbero sul sito pubblico, prima di premere "Salva sito" — senza mai scrivere su R2.

**Architecture:** `buildPendingSite` estrae in una funzione pura la logica (oggi inline) che costruisce l'oggetto sito dai valori del form; sia "Salva" che "Anteprima" la riusano. Un nuovo modulo `preview.js` apre un overlay a schermo intero dentro `/admin` stesso, riusando direttamente `renderHero`/`renderFooter` — le stesse funzioni del sito pubblico — con focus-trap e chiusura via Escape sullo stesso pattern già stabilito da `Lightbox.js` in questo progetto.

**Tech Stack:** Vanilla JS, Vitest + jsdom (stesso stack del resto della dashboard admin).

**Spec:** `docs/maintainers/superpowers/specs/2026-07-11-admin-preview-design.md`

## Global Constraints

- **Scope**: solo nome/bio/Instagram. La hero (già istantanea via picker) e tutte le azioni sugli album (istantanee) restano fuori scope, invariate.
- **Nessuna scrittura R2** durante l'anteprima: `showPreview` non chiama mai `api.putSite` o altre rotte.
- **Listener one-time**: il listener `keydown` per Escape/focus-trap va agganciato **una sola volta a livello di modulo**, mai dentro `showPreview` (che viene chiamata ad ogni click sul tasto) — altrimenti si accumula esattamente come il bug già corretto in `album.js`/`attachSortable` durante la review finale del piano precedente.
- **Riuso diretto** di `renderHero`/`renderFooter` — nessuna reimplementazione parallela del loro markup/logica.
- **Dependency injection** per `showPreview`: `home.js` la riceve via `ctx.deps.showPreview` (stesso pattern di `deps.attachSortable`, `deps.fetchManifest`, `deps.prompt`), non tramite import diretto — per coerenza con come il resto di `home.js` gestisce le dipendenze DOM-side-effecting, e per permettere ai test di verificare la chiamata senza dover verificare il rendering interno di `preview.js` (già coperto dai suoi test dedicati).

### Schema dati di riferimento

```
buildPendingSite({ name, bio, instagram }, currentSite) → { name, bio, hero, social }
  // stessa forma che api.putSite si aspetta oggi

showPreview(container, { name, bio, heroUrl, social }, texts) → void
  // heroUrl è già calcolata dal chiamante (photoUrl(...) su currentSite.hero, invariata)
hidePreview(container) → void
```

---

### Task 1: `buildPendingSite` — estrazione pura + refactor del Save handler

**Files:**
- Modify: `src/admin/views/home.js`
- Test: `src/admin/views/home.test.js`

**Interfaces:**
- Produces: `buildPendingSite({ name, bio, instagram }, currentSite) → { name, bio, hero, social }`, esportata da `home.js`. Usata da Task 3 (handler del tasto Anteprima).

- [ ] **Step 1: Scrivi i test (falliranno)**

Aggiungi in cima a `src/admin/views/home.test.js`, dopo l'import esistente:

```js
import { renderAdminHome, buildPendingSite } from './home.js';
```

Aggiungi questo blocco `describe` prima di `describe('renderAdminHome', ...)`:

```js
describe('buildPendingSite', () => {
  const currentSite = { name: 'Vecchio', bio: 'Vecchia bio', hero: { album: 'sport', name: 'a.webp' }, social: { instagram: 'https://old', twitter: 'https://x' } };

  it('costruisce l\'oggetto con i nuovi valori, trimma name e instagram ma non bio', () => {
    const result = buildPendingSite({ name: '  Nuovo  ', bio: '  Bio con spazi  ', instagram: '  https://new  ' }, currentSite);
    expect(result.name).toBe('Nuovo');
    expect(result.bio).toBe('  Bio con spazi  ');
    expect(result.social.instagram).toBe('https://new');
  });

  it('la hero passa invariata da currentSite, non fa parte dei valori nuovi', () => {
    const result = buildPendingSite({ name: 'X', bio: '', instagram: '' }, currentSite);
    expect(result.hero).toEqual({ album: 'sport', name: 'a.webp' });
  });

  it('social preserva le altre chiavi oltre instagram', () => {
    const result = buildPendingSite({ name: 'X', bio: '', instagram: 'https://new' }, currentSite);
    expect(result.social).toEqual({ instagram: 'https://new', twitter: 'https://x' });
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/admin/views/home.test.js`
Expected: FAIL — `buildPendingSite` non è esportata da `home.js`.

- [ ] **Step 3: Implementa**

In `src/admin/views/home.js`, aggiungi questa funzione esportata **prima** di `renderAdminHome` (non dentro):

```js
export function buildPendingSite({ name, bio, instagram }, currentSite) {
  return {
    name: name.trim(),
    bio,
    hero: currentSite.hero,
    social: { ...currentSite.social, instagram: instagram.trim() },
  };
}
```

Poi sostituisci il click-handler di "Salva sito" (dentro `renderAdminHome`) da:

```js
  q('.admin-save-site').addEventListener('click', () => run(async () => {
    const updated = {
      name: q('[name="site-name"]').value.trim(),
      bio: q('[name="site-bio"]').value,
      hero: site.hero,
      social: { ...site.social, instagram: q('[name="site-instagram"]').value.trim() },
    };
    await api.putSite(updated);
    ctx.site = updated;
    say('Sito salvato.');
  }));
```

a:

```js
  q('.admin-save-site').addEventListener('click', () => run(async () => {
    const updated = buildPendingSite({
      name: q('[name="site-name"]').value,
      bio: q('[name="site-bio"]').value,
      instagram: q('[name="site-instagram"]').value,
    }, site);
    await api.putSite(updated);
    ctx.site = updated;
    say('Sito salvato.');
  }));
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/admin/views/home.test.js`
Expected: PASS (tutti i test, inclusi quelli di `buildPendingSite` e quelli preesistenti di `renderAdminHome` — in particolare `'salva il sito con i valori del form'` deve continuare a passare invariata, prova che il refactor non ha cambiato il comportamento).

- [ ] **Step 5: Commit**

```bash
git add src/admin/views/home.js src/admin/views/home.test.js
git commit -m "refactor(admin): estrai buildPendingSite dal Save handler di home.js"
```

---

### Task 2: `preview.js` — overlay riutilizzabile con focus-trap

**Files:**
- Create: `src/admin/preview.js`
- Test: `src/admin/preview.test.js`
- Modify: `src/styles/admin.css` (append)

**Interfaces:**
- Consumes: `renderHero(container, {name, bio, heroUrl}, texts)` da `src/components/Hero.js`; `renderFooter(container, texts, social)` da `src/components/Footer.js`.
- Produces: `showPreview(container, { name, bio, heroUrl, social }, texts) → void`, `hidePreview(container) → void`. Usate da Task 3 (`home.js`, via `ctx.deps.showPreview`).

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/admin/preview.test.js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { showPreview, hidePreview } from './preview.js';

const texts = { landing: { heroSubtitle: 'Sottotitolo statico.' } };
const pending = { name: 'Davide', bio: 'La mia bio', heroUrl: 'https://x/img.webp', social: { instagram: 'https://instagram.com/x' } };

describe('showPreview / hidePreview', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    container.hidden = true;
    document.body.replaceChildren(container);
  });
  afterEach(() => { document.body.replaceChildren(); });

  it('mostra il contenitore e renderizza titolo, sottotitolo (bio) e link social', () => {
    showPreview(container, pending, texts);
    expect(container.hidden).toBe(false);
    expect(container.querySelector('.hero__title').textContent).toBe('Davide');
    expect(container.querySelector('.hero__subtitle').textContent).toBe('La mia bio');
    expect(container.querySelector('.site-footer__link').getAttribute('href')).toBe('https://instagram.com/x');
  });

  it('sposta il focus sul tasto Chiudi', () => {
    showPreview(container, pending, texts);
    expect(document.activeElement).toBe(container.querySelector('.admin-preview__close'));
  });

  it('hidePreview nasconde e svuota il contenitore', () => {
    showPreview(container, pending, texts);
    hidePreview(container);
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe('');
  });

  it('click sul tasto Chiudi chiama hidePreview', () => {
    showPreview(container, pending, texts);
    container.querySelector('.admin-preview__close').click();
    expect(container.hidden).toBe(true);
  });

  it('Escape chiude solo quando il contenitore è visibile', () => {
    // overlay chiuso: Escape non deve fare nulla (niente da verificare se non l'assenza di errori)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.hidden).toBe(true);

    showPreview(container, pending, texts);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe('');
  });

  it('il listener keydown è agganciato una sola volta anche dopo molte show/hide ripetute', () => {
    const spy = vi.spyOn(document, 'addEventListener');
    showPreview(container, pending, texts);
    hidePreview(container);
    showPreview(container, pending, texts);
    hidePreview(container);
    showPreview(container, pending, texts);
    const keydownCalls = spy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownCalls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });

  it('Tab sull\'ultimo elemento focusabile (link social) torna al primo (Chiudi) — anello, non snap-back', () => {
    showPreview(container, pending, texts); // pending ha instagram → un link social presente
    const closeBtn = container.querySelector('.admin-preview__close');
    const link = container.querySelector('.site-footer__link');
    expect(link).not.toBeNull(); // pre-condizione: il test non ha senso senza un link da raggiungere

    link.focus();
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(closeBtn);
    expect(tabEvent.defaultPrevented).toBe(true);
  });

  it('Shift+Tab sul primo elemento (Chiudi) va all\'ultimo (link social) — anello nell\'altra direzione', () => {
    showPreview(container, pending, texts);
    const closeBtn = container.querySelector('.admin-preview__close');
    const link = container.querySelector('.site-footer__link');

    closeBtn.focus();
    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(shiftTabEvent);
    expect(document.activeElement).toBe(link);
    expect(shiftTabEvent.defaultPrevented).toBe(true);
  });

  it('Tab NON ai bordi (nessun social, solo il tasto Chiudi) non interviene — non c\'è nulla da ciclare', () => {
    const noSocial = { ...pending, social: {} };
    showPreview(container, noSocial, texts);
    expect(container.querySelector('.site-footer__link')).toBeNull(); // un solo elemento focusabile: Chiudi

    const closeBtn = container.querySelector('.admin-preview__close');
    closeBtn.focus();
    // Chiudi è sia primo che ultimo: Tab in avanti deve comunque tenerlo lì (anello di un solo elemento)
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(closeBtn);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/admin/preview.test.js`
Expected: FAIL — modulo `./preview.js` inesistente.

- [ ] **Step 3: Implementa**

```js
// src/admin/preview.js
// Overlay di anteprima per il form Sito. Riusa renderHero/renderFooter — le
// stesse funzioni del sito pubblico — così l'anteprima non è mai una
// reimplementazione parallela che può disallinearsi.
import { renderHero } from '../components/Hero.js';
import { renderFooter } from '../components/Footer.js';

// Il listener va agganciato una sola volta PER SEMPRE (non per container: il
// container viene ricreato ad ogni render di home.js). Cerca il contenitore
// vivo al momento del keydown invece di chiuderci sopra un riferimento che
// potrebbe diventare stantio — evita l'accumulo di listener già corretto
// una volta in album.js/attachSortable.
let _keyboardBound = false;

function currentPreviewEl() {
  return document.querySelector('.admin-preview');
}

// Interroga i focusabili ogni volta (non li memorizza): il footer può avere
// zero o più link social a seconda del pending state corrente.
function focusableElements(el) {
  return [...el.querySelectorAll('button, a[href]')];
}

function ensureKeyboardHandling() {
  if (_keyboardBound) return;
  _keyboardBound = true;
  document.addEventListener('keydown', e => {
    const el = currentPreviewEl();
    if (!el || el.hidden) return;
    if (e.key === 'Escape') {
      hidePreview(el);
      return;
    }
    if (e.key !== 'Tab') return;
    // Anello tra primo e ultimo focusabile — interviene solo ai bordi.
    // Nel mezzo (es. dal tasto Chiudi a un link social) Tab si muove
    // normalmente, senza preventDefault: i link nel footer restano
    // raggiungibili da tastiera, non solo il tasto Chiudi.
    const focusable = focusableElements(el);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

export function showPreview(container, { name, bio, heroUrl, social }, texts) {
  ensureKeyboardHandling();
  container.innerHTML = `
    <div class="admin-preview__header">
      <h2>Anteprima</h2>
      <button class="admin-preview__close" type="button">Chiudi</button>
    </div>
    <div class="admin-preview__content">
      <div class="admin-preview__hero"></div>
      <div class="admin-preview__footer"></div>
    </div>
  `;
  renderHero(container.querySelector('.admin-preview__hero'), { name, bio, heroUrl }, texts);
  renderFooter(container.querySelector('.admin-preview__footer'), texts, social);

  const closeBtn = container.querySelector('.admin-preview__close');
  closeBtn.addEventListener('click', () => hidePreview(container));

  container.hidden = false;
  closeBtn.focus();
}

export function hidePreview(container) {
  container.hidden = true;
  container.innerHTML = '';
}
```

Append in coda a `src/styles/admin.css`:

```css
/* Header fisso + contenuto scrollabile separati: se hero+footer sono più
   alti del viewport, chi scorre per vedere il footer non deve perdere di
   vista il tasto Chiudi — niente overflow su .admin-preview stesso. */
.admin-preview {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}

.admin-preview__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg);
  flex-shrink: 0;
}

.admin-preview__header h2 {
  margin: 0;
  font-weight: 400;
}

.admin-preview__content {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-lg) var(--space-lg);
}

.admin-preview__close {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid #2e3235;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/admin/preview.test.js`
Expected: PASS (tutti i test).

- [ ] **Step 5: Commit**

```bash
git add src/admin/preview.js src/admin/preview.test.js src/styles/admin.css
git commit -m "feat(admin): preview.js — overlay anteprima con focus-trap, riusa renderHero/renderFooter"
```

---

### Task 3: Wiring nel form Sito — tasto Anteprima

**Files:**
- Modify: `src/admin/views/home.js`
- Modify: `src/pages/admin.js`
- Test: `src/admin/views/home.test.js`

**Interfaces:**
- Consumes: `buildPendingSite` (Task 1, stesso file); `showPreview` (Task 2, iniettata via `ctx.deps.showPreview`).
- Produces: nessuna nuova interfaccia pubblica — collega i pezzi esistenti nella UI.

- [ ] **Step 1: Scrivi il test (fallirà)**

In `src/admin/views/home.test.js`, aggiorna `makeCtx()` aggiungendo `showPreview` ai `deps` mockati:

```js
    deps: {
      attachSortable: vi.fn(), // cattura onMove
      fetchManifest: vi.fn(async () => ({ ok: true, data: [] })),
      prompt: vi.fn(() => null),
      showPreview: vi.fn(),
    },
```

Aggiungi questo test dentro `describe('renderAdminHome', ...)`, dopo il test `'salva il sito con i valori del form'`:

```js
  it('tasto Anteprima chiama deps.showPreview con i valori correnti del form, senza toccare l\'API', () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('[name="site-name"]').value = 'Nome Bozza';
    container.querySelector('[name="site-bio"]').value = 'Bio bozza';
    container.querySelector('[name="site-instagram"]').value = 'https://instagram.com/bozza';
    container.querySelector('.admin-preview-btn').click();

    expect(ctx.deps.showPreview).toHaveBeenCalledTimes(1);
    const [previewEl, data] = ctx.deps.showPreview.mock.calls[0];
    expect(previewEl.className).toBe('admin-preview');
    expect(data).toEqual({ name: 'Nome Bozza', bio: 'Bio bozza', heroUrl: null, social: { instagram: 'https://instagram.com/bozza' } });
    expect(ctx.api.putSite).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run src/admin/views/home.test.js`
Expected: FAIL — `.admin-preview-btn` non esiste nel template.

- [ ] **Step 3: Implementa**

In `src/admin/views/home.js`, nel template HTML dentro `renderAdminHome` (la sezione `<section class="admin-panel"><h2>Sito</h2>...`), aggiungi il tasto Anteprima subito prima di `<button class="admin-save-site">` e il contenitore overlay subito dopo la chiusura di quella `<section>`:

```html
      <button class="admin-preview-btn" type="button">Anteprima</button>
      <button class="admin-save-site">Salva sito</button>
      <p class="admin-status" role="status"></p>
    </section>
    <div class="admin-preview" hidden></div>
```

Aggiungi il click-handler, subito dopo il blocco esistente di `.admin-save-site`:

```js
  q('.admin-preview-btn').addEventListener('click', () => {
    const pending = buildPendingSite({
      name: q('[name="site-name"]').value,
      bio: q('[name="site-bio"]').value,
      instagram: q('[name="site-instagram"]').value,
    }, site);
    deps.showPreview(q('.admin-preview'), { name: pending.name, bio: pending.bio, heroUrl: heroSrc, social: pending.social }, texts);
  });
```

`texts` non è oggi un parametro di `renderAdminHome(container, ctx)` — va importato. In cima a `src/admin/views/home.js`, aggiungi:

```js
import { texts } from '../../../config/texts.config.js';
```

In `src/pages/admin.js`, aggiungi l'import e la voce in `ctx.deps`:

```js
import { showPreview } from '../admin/preview.js';
```

Nell'oggetto `deps` dentro `ctx` (accanto a `prompt: window.prompt.bind(window),`), aggiungi:

```js
    showPreview,
```

- [ ] **Step 4: Verifica che passi**

Run: `npx vitest run src/admin/views/home.test.js`
Expected: PASS (tutti i test, inclusi quelli preesistenti — verifica che nessuno si sia rotto).

- [ ] **Step 5: Suite completa e build**

Run: `npm test`
Expected: PASS, nessuna regressione (baseline 185/185 + i nuovi test di questo piano).

Run: `rm -rf dist && npm run build`
Expected: build pulita, nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/admin/views/home.js src/pages/admin.js
git commit -m "feat(admin): collega il tasto Anteprima al form Sito"
```

---

## Note per l'esecuzione

- Ordine tassativo: Task 1 → 2 → 3 (Task 3 consuma le interfacce di entrambi i precedenti).
- Tutti e tre i task sono TDD puro, eseguibili in sessione.
- Dopo Task 3, verifica manuale nel browser consigliata (dev server, form Sito, click Anteprima, Tab per controllare il focus-trap, Escape per chiudere) prima di considerare il piano concluso — l'interazione da tastiera non è mai stata verificata visivamente in questa sessione, solo via jsdom.
