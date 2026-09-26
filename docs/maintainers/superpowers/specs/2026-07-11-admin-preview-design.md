# Tasto Anteprima (site-settings) — Design

**Data**: 2026-07-11
**Stato**: in revisione

## Obiettivo

Dare al site owner un modo di vedere come nome/bio/Instagram appariranno sul sito pubblico **prima** di premere "Salva sito", senza scrivere nulla su R2 nel frattempo.

## Scope

**Dentro**: solo il form "Sito" in `views/home.js` — nome, bio, Instagram. Questi sono gli unici tre campi con un vero stato "non salvato" oggi: restano nei campi del form finché non premi "Salva sito", che li scrive con un `PUT /api/admin/site`.

**Fuori** (deciso esplicitamente):
- **Hero**: il picker hero applica già immediatamente (`api.putSite` al click sulla thumbnail), non ha uno stato "pendente" da mostrare in anteprima. L'anteprima userà la hero *attualmente salvata*, invariata.
- **Album** (riordino foto, cover, elimina, nuovo album): tutte le azioni restano a salvataggio istantaneo come sono oggi. Nessun cambio al modello di interazione. Un'anteprima per gli album richiederebbe prima trasformarli in "modifica poi salva" — fuori scope, eventualmente un progetto a parte in futuro.

## Approccio scelto

Overlay a schermo intero dentro la pagina `/admin` stessa, che riusa direttamente `renderHero` e `renderFooter` — le stesse funzioni che disegnano il sito pubblico — invece di ricostruire un layout parallelo. Nessuna nuova scheda del browser, nessun iframe, nessun cambiamento al codice della pagina pubblica.

Alternative valutate e scartate: aprire la home reale in una scheda nuova via `sessionStorage` (fedeltà visiva maggiore, ma tocca `index.js` — codice pubblico — e serve un canale di comunicazione cross-tab); stesso approccio via iframe/`postMessage` (fedeltà simile, complessità maggiore, scartato per lo stesso motivo con in più la gestione del ciclo di vita dell'iframe).

Compromesso accettato: l'overlay vive dentro il "guscio" visivo dell'admin (font, colori, spaziature di `admin.css`), non è pixel-identico alla home vera. Mostra correttamente titolo, sottotitolo (bio) e link social — l'informazione che serve per decidere se pubblicare.

## Componenti

### `buildPendingSite({ name, bio, instagram }, currentSite)` — nuovo, in `views/home.js`

Funzione pura. Oggi la logica di costruzione dell'oggetto da salvare è scritta inline dentro il click-handler di "Salva sito":

```js
const updated = {
  name: q('[name="site-name"]').value.trim(),
  bio: q('[name="site-bio"]').value,
  hero: site.hero,
  social: { ...site.social, instagram: q('[name="site-instagram"]').value.trim() },
};
```

Viene estratta così:

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

Sia "Salva sito" che "Anteprima" leggono i 3 valori correnti dal form (`q(...).value`) e chiamano questa stessa funzione — "Salva" passa il risultato a `api.putSite(...)`, "Anteprima" lo passa a `showPreview(...)`. Stessa logica, zero duplicazione, testabile senza DOM.

### `src/admin/preview.js` — nuovo modulo

```
showPreview(container, pendingSite, texts)
hidePreview(container)
```

`showPreview(container, { name, bio, heroUrl, social }, texts)` — riceve un oggetto già nella forma che `renderHero`/`renderFooter` si aspettano (non `pendingSite.hero`, ma `heroUrl` già calcolata). `home.js` la costruisce così, riusando `heroSrc` che già calcola oggi in cima a `renderAdminHome` (`const heroSrc = site.hero ? photoUrl(r2PublicUrl, site.hero.album, site.hero.name) : null;` — invariata, dato che la hero è fuori scope) invece di far conoscere a `preview.js` `photoUrl`/`r2PublicUrl`:

```js
const pending = buildPendingSite({ name, bio, instagram }, site);
showPreview(previewEl, { name: pending.name, bio: pending.bio, heroUrl: heroSrc, social: pending.social }, texts);
```

Dentro, `showPreview` popola il contenitore overlay (già presente nell'HTML di `home.js`, nascosto di default) con:
- Un **header fisso** (`admin-preview__header`, mai scrollabile) con titolo "Anteprima" e tasto "Chiudi" — sempre raggiungibile indipendentemente da quanto si scorre sotto
- Un **contenitore scrollabile** (`admin-preview__content`, `overflow-y: auto`) separato dall'header, dentro cui vengono chiamati `renderHero(innerContainer, { name, bio, heroUrl }, texts)` e `renderFooter(innerContainer, texts, social)`

Separare header fisso e contenuto scrollabile (invece di un unico contenitore con `overflow-y: auto` su tutto, incluso l'header) evita che il tasto "Chiudi" scorra fuori dallo schermo quando il contenuto (hero + footer) è più alto del viewport.

Poi rimuove l'attributo `hidden` dal contenitore overlay e sposta il focus sul tasto "Chiudi". `hidePreview` fa l'inverso (rimette `hidden`, svuota il contenuto, restituisce il focus al tasto "Anteprima" che ha aperto l'overlay).

Il CSS di `hero.css` e `footer.css` arriva automaticamente nel bundle admin, dato che `Hero.js`/`Footer.js` li importano già — Vite li bundlerà insieme a `preview.js` che li invoca, senza bisogno di duplicare nulla.

**Focus trap e tasto Escape — stesso pattern già usato da `Lightbox.js`** (non nuovo per questo progetto): un listener `keydown` su `document`, agganciato **una sola volta** quando `preview.js` viene inizializzato (non ad ogni `showPreview`, altrimenti si accumula come i listener di `attachSortable` che ho corretto nella review finale — stesso identico bug, evitato da subito qui). L'handler controlla se l'overlay è attualmente visibile prima di agire:
- `Escape` → `hidePreview`
- `Tab` / `Shift+Tab`: **anello vero tra primo e ultimo elemento focusabile**, non uno snap-back forzato sul tasto Chiudi. Quando ci sono link social nel footer (il caso normale — è esattamente ciò che l'anteprima serve a verificare), sono elementi focusabili a pieno titolo: l'utente deve poterci arrivare con Tab, non solo vedere il tasto Chiudi rimbalzare. La lista dei focusabili viene interrogata di volta in volta (`el.querySelectorAll('button, a[href]')`, ricalcolata ad ogni pressione — cambia in base a quanti link social sono presenti in quel momento), e l'intervento scatta solo ai bordi: `Tab` sull'ultimo elemento → torna al primo; `Shift+Tab` sul primo → va all'ultimo. Nel mezzo, Tab si muove liberamente come da comportamento nativo del browser. Stesso codice di `Lightbox.js` righe 59-71.

### Modifiche a `views/home.js`

- Nell'HTML iniziale del template: aggiunto `<div class="admin-preview" hidden></div>` (contenitore vuoto, stesso pattern di `.admin-photo-grid` in `album.js` — creato una volta, riempito da `showPreview`).
- Nuovo tasto "Anteprima" accanto a "Salva sito". Click → legge i 3 valori dal form, chiama `buildPendingSite`, chiama `showPreview`.
- Tasto "Chiudi" dentro l'overlay → chiama `hidePreview`. Escape e focus-trap gestiti dal listener one-time descritto sopra.

## Testing

- `buildPendingSite`: test puro, nessun DOM — verifica che `hero` passi invariata da `currentSite`, che `social` preservi le altre chiavi oltre `instagram`, che name/instagram vengano trimmati e bio no (stesso comportamento di oggi).
- `preview.js`: test jsdom — `showPreview` popola titolo/sottotitolo/footer coi valori passati, rimuove `hidden`, sposta il focus sul tasto Chiudi; `hidePreview` rimette `hidden`, svuota, restituisce il focus. Escape chiude solo quando l'overlay è visibile (chiamare l'handler con overlay chiuso non deve fare nulla). Il listener è verificabilmente unico: aprire/chiudere l'overlay ripetutamente e premere Escape una volta chiama `hidePreview` una sola volta, non N — stesso test-di-non-regressione già scritto per `attachSortable` in `album.test.js`.
- `views/home.test.js`: aggiornato per verificare che il click su "Anteprima" chiami `showPreview` con l'oggetto costruito da `buildPendingSite` sui valori correnti del form (senza mai chiamare `api.putSite`).

## Fuori scope (deciso esplicitamente)

- Anteprima per hero, riordino album, cover, foto — vedi sezione Scope sopra.
- Fedeltà pixel-perfect rispetto alla home reale (nav, container, spaziature) — accettato il compromesso dell'overlay dentro il guscio admin.
- Chiusura per click sul backdrop — non giustificata (il tasto Chiudi ed Escape bastano); focus-trap ed Escape sono invece dentro lo scope, vedi sopra.
