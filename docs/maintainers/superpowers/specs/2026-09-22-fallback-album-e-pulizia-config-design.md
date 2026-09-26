# Fallback degli album e pulizia della configurazione — Design

**Data**: 2026-09-22
**Stato**: approvato in brainstorming, da rivedere
**Origine**: audit del percorso di setup, 22/09/2026. Dal fork al sito online sono circa
23 passi, 4 superfici di configurazione e **2 tipi di credenziali diversi**. Uno dei due
tipi esiste per un solo scopo, e quello scopo può smettere di essere obbligatorio.

## Obiettivo

Che `npm run dev` subito dopo il clone mostri un sito che funziona, e che le credenziali
S3 di R2 escano dal percorso obbligatorio per mettere online un portfolio.

---

## 1. Il punto di partenza, verificato

Verificato sul codice il 2026-09-22:

| Cosa | Stato |
|---|---|
| Contenuti del sito (nome, bio, social, hero) | **ricadono** su `config/site.config.js` se il fetch fallisce (`src/pages/home-logic.js:23`) |
| Album | **nessun fallback**: su 404 la home stampa un messaggio d'errore (`src/pages/index.js:29`) |
| `npm run migrate` | richiede `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (`scripts/migrate.js:61`) |
| `.env.example` | contiene `VITE_TURNSTILE_SITEKEY`, che alimenta `config/site.config.js:18` |
| `npm run upload` | citato nei README **solo** come giustificazione dell'esistenza di `.env`; mai documentato come flusso |
| `scripts/upload.js:27` | messaggio d'errore ancora in italiano |
| Quick start | invita a `npm run dev` prima che esista un bucket |

Il commento che descrive il meccanismo esistente lo dichiara deliberato:

```js
// home-logic.js:23
// Asymmetric fallback: site degrades gracefully to build values if fetch fails.
```

**Il meccanismo giusto c'è già, applicato a una delle due sorgenti di dati.** Oggi, appena
dopo il clone, la home mostra nome e bio dal seed e un errore al posto degli album: è la
prima cosa che vede chi valuta il template.

### Un vincolo verificato sul seed

`config/albums.config.js` distribuisce `coverName: ''`, mentre il validatore accetta solo
`null` o un nome di foto valido:

```js
// content-rules.js:70
if (a.coverName !== null && !isPhotoName(a.coverName)) return fail(...);
```

La stringa vuota non è un nome valido. È la stessa asimmetria che ha già prodotto un bug
quando il seed venne normalizzato con `??` invece di `||`, lasciando passare `''`. Il
fallback **deve** normalizzare `'' → null`, o produce URL di copertina rotti.

## 2. Decisioni

1. **Il fallback degli album si attiva solo su `NOT_FOUND`.** Vedi §3.1: gli altri tre
   esiti continuano a mostrare un errore, come oggi.
2. **`migrate` resta, ma smette di essere un cancello.** Diventa il passo che dà alla
   dashboard qualcosa da modificare, non il passo che rende visibile il sito.
3. **`.env` esce dal percorso obbligatorio**, e con lui le credenziali S3 di R2.
4. **`npm run upload` si documenta, non si cancella.** È codice funzionante con i suoi
   test; toglierlo è una decisione separata, che questo lavoro non prende.
5. **`VITE_TURNSTILE_SITEKEY` si toglie.** Il sitekey deve avere una sorgente sola.

## 3. Design

### 3.1 Il fallback degli album

Una funzione pura accanto a quella che esiste già, in `src/pages/home-logic.js`:

```js
export function resolveAlbums(albumsRes, buildAlbums) { ... }
```

- se `albumsRes.ok`, restituisce `albumsRes.data` così com'è;
- se l'errore è **`NOT_FOUND`**, restituisce il seed **normalizzato**:
  `coverName: a.coverName || null`, per la ragione della sezione 1;
- per ogni altro errore restituisce `null`, e il chiamante mostra il messaggio d'errore che
  mostra oggi.

#### Perché solo `NOT_FOUND`

`src/providers/data.js:14-31` distingue quattro esiti — `NETWORK`, `NOT_FOUND`, `UNKNOWN`,
`MALFORMED` — e l'intestazione del modulo dichiara che è compito del chiamante decidere
caso per caso. I quattro significano cose diverse, e per gli album vanno trattati diversi:

| Esito | Significato | Comportamento |
|---|---|---|
| `NOT_FOUND` | R2 non ha `albums.json`: installazione nuova | **seed** |
| `MALFORMED` | i dati esistono ma sono corrotti o non passano la validazione | errore |
| `NETWORK`, `UNKNOWN` | guasto transitorio | errore |

Il caso che decide è `MALFORMED`, e lo decide un bug già avvenuto: quando `coverName: ''`
passò la normalizzazione e `validateAlbumsShape` lo respinse, il sito rifiutò i propri dati
migrati. Fu sgradevole ma **visibile**, e diagnosticato subito. Con un fallback su qualunque
errore lo stesso bug si presenterebbe come «il sito mostra l'album di esempio e i tuoi
spariscono»: un guasto che urlava diventerebbe un guasto che sussurra.

`resolveSiteContent` collassa invece i quattro esiti in uno, e per i contenuti del sito ha
senso: la cornice **deve** disegnare un nome e un hero. Una lista di album vuota con un
messaggio è una risposta legittima; una pagina senza intestazione no.

`src/pages/index.js` smette di stampare l'errore e chiama `resolveAlbums`.

La pagina del singolo album passa invece da `resolveAlbumPage(slug, albumsRes, manifestRes)`
(`src/pages/album.js:34`, logica in `src/pages/album-logic.js`): lì il fallback va
applicato **a monte**, passando la lista già risolta al posto di `albumsRes` grezzo, così
che la regola viva in un punto solo e `resolveAlbumPage` non debba conoscere il seed.

Il commento di `home-logic.js:23` dice «Asymmetric fallback». L'asimmetria **resta**, ma
cambia significato: non è più «il sito ricade, gli album no», è «il sito ricade su
qualunque errore, gli album solo quando R2 non ha ancora dati». Il commento va quindi
esteso a dire entrambe le regole e perché differiscono — è uno di quelli che
[`CONTRIBUTING.md`](../../../CONTRIBUTING.md) chiede di non cancellare, e dopo questo
lavoro spiega una scelta più sottile di prima, non meno.

### 3.2 Quello che il fallback non può dare

Le foto sono file, non seed. Quindi con un bucket vuoto:

- la home mostra **le card degli album** dal seed;
- aprire un album mostra **un album vuoto**, perché il manifest delle foto vive solo su R2.

È il comportamento corretto e va scritto nel README, così che nessuno lo prenda per un
difetto da correggere più avanti.

### 3.3 Cosa cambia nei README

| Sezione | Oggi | Dopo |
|---|---|---|
| Quick start | `cp .env.example .env` e cinque variabili da compilare prima di `npm run dev` | `npm install && npm run dev`, e il sito si vede |
| 3. Variabili d'ambiente locali | passo obbligatorio del setup | passo facoltativo, marcato «serve solo per `migrate` e `upload`» |
| 4. Seed iniziale | `migrate` presentato come il passo che accende il sito | `migrate` presentato come il passo che porta il seed nella dashboard |

L'avvertenza esistente su `migrate` — che rilanciarlo dopo aver usato la dashboard
sovrascrive il lavoro fatto — resta dov'è: quella è memoria di un rischio vero.

### 3.4 Pulizia della configurazione

- `VITE_TURNSTILE_SITEKEY` esce da `.env.example` e da `config/site.config.js:18`. Il
  sitekey resta con una sola provenienza: `wrangler.json` → `/api/data/config`. In locale
  il form non mostrerà il widget, ed è corretto — in locale il Worker non risponde
  comunque.
- `scripts/upload.js:27`: messaggio d'errore in inglese, come il resto del progetto.
- `npm run upload` guadagna una riga che dice a cosa serve, nella tabella degli script dove
  già vive `npm run compress`.

## 4. Cosa questo lavoro non fa

- non tocca `migrate` nel suo funzionamento, solo nel posto che occupa nella narrazione;
- non cancella `upload.js`;
- non cambia l'architettura dei dati: R2 resta la verità a runtime, `config/` resta il seed;
- non tocca l'infrastruttura né staging.

## 5. Rischi

Restringere il fallback a `NOT_FOUND` toglie i due rischi che una versione precedente di
questa spec dichiarava, e vale la pena dire perché non ci sono più:

- **non maschera un guasto di R2**, perché un guasto non produce `NOT_FOUND` ma `NETWORK`,
  `UNKNOWN` o un 5xx, e quei casi continuano a mostrare l'errore;
- **non fa comparire `nome-album` su un sito vivo**, perché un sito già popolato ha il suo
  `albums.json` su R2: `NOT_FOUND` lì non capita.

**Il rischio che resta** è ristretto e va scritto nel commento: un sito che ha perso
`albums.json` — cancellato per sbaglio dalla dashboard, o bucket sbagliato in
`wrangler.json` — mostrerà il seed invece di un errore. Il secondo caso è il più insidioso,
perché puntare al bucket sbagliato è un errore di configurazione plausibile e il sito
sembrerebbe funzionare. È il prezzo accettato in cambio del fatto che un'installazione nuova
si vede, e va dichiarato come scelta, non subìto come conseguenza.

## 6. Verifica

- Test della funzione pura sui quattro esiti: riuscito → dati di R2; `NOT_FOUND` → seed
  normalizzato, con `coverName: ''` che diventa `null`; `MALFORMED`, `NETWORK` e `UNKNOWN`
  → nessun fallback.
- Test che la home renda le card su `NOT_FOUND` e continui a mostrare il paragrafo
  d'errore su `MALFORMED` — è la regressione che conta, perché è il caso in cui un bug dei
  dati tornerebbe invisibile.
- `npm run dev` dopo un clone pulito, senza `.env` e senza bucket: la home mostra le card
  del seed.
- `npm test` e `ALLOW_PLACEHOLDER_CSP=1 npm run build` verdi.
- Nessun riferimento residuo a `VITE_TURNSTILE_SITEKEY` in tutto il repo.
