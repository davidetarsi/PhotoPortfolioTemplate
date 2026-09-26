# r2PublicUrl a runtime — Design

**Data**: 2026-07-12
**Stato**: approvato (con contro-review di una proposta esterna incorporata)

## Problema

`r2PublicUrl` è oggi `import.meta.env.VITE_R2_PUBLIC_URL`, iniettato da Vite a **build time**. Cloudflare Workers Builds (a differenza di Cloudflare Pages) non separa le "Variables and secrets" di build per branch Production/Preview — è un'unica lista condivisa, confermato dal pannello reale del progetto. Risultato: ogni branch (incluso `staging`) riceve lo stesso identico `VITE_R2_PUBLIC_URL`, sempre quello di produzione. Le operazioni admin (upload/delete/reorder) scrivono correttamente sul bucket giusto per ambiente (bindings R2 in `wrangler.json`, runtime, già isolati per `env.staging`), ma le URL delle immagini costruite lato client puntano sempre al bucket sbagliato per staging — foto caricate su staging risultano "rotte" sul sito perché l'URL costruito cerca quel file nel bucket di produzione, dove non esiste.

Motivazione dell'utente: la fase di staging serve per testare evoluzioni del sito con dati (incluse le immagini) genuinamente separati da produzione — non solo per verificare la logica del pannello admin.

## Soluzione

Il Worker **sa già** correttamente in quale ambiente gira (tramite `wrangler.json`'s `env.staging`). Si sposta `r2PublicUrl` da build-time (Vite, condiviso) a runtime (Worker var, isolato per ambiente).

### Nuova var Worker

`R2_PUBLIC_URL` in `wrangler.json`, sia in cima (produzione) che dentro `env.staging` — stessa categoria di `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` (config infrastrutturale, non contenuto editabile dall'admin, quindi mai dentro `_site/site.json`).

### Nuova rotta: `GET /api/data/config`

Endpoint dedicato e separato, **non** unito a `/api/data/site`. Motivazione (dopo contro-review di una proposta di merge — vedi sezione sotto): `handleDataRequest` oggi è un handler generico condiviso da tre rotte, tutte puro passthrough dei byte da R2 (nessun parsing lato Worker). Unire `r2PublicUrl` dentro `site.json` richiederebbe un caso speciale per quella rotta (parse JSON, merge, re-stringify), rompendo l'uniformità dell'handler e introducendo un path di errore server-side (JSON malformato) che oggi non esiste — parsing e validazione avvengono solo lato client, di proposito. La nuova rotta non tocca R2 affatto: puro passthrough della var d'ambiente.

```js
GET /api/data/config → { r2PublicUrl: env.R2_PUBLIC_URL ?? null }
Cache-Control: no-store (stessa policy delle altre /api/data/*)
```

### Client: `fetchConfig()`

Nuova funzione in `src/providers/data.js`, stesso pattern di `fetchSite`/`fetchAlbums`/`fetchManifest` (mai throw, result object `{ok, data}` o `{ok:false, error}`). Nuovo validatore `validateConfigShape` in `content-rules.js`.

### Wiring nei 4 bootstrap (`index.js`, `contatti.js`, `album.js`, `admin.js`)

Ogni pagina aggiunge `fetchConfig()` al `Promise.all` già esistente (nessuna richiesta sequenziale aggiunta — stessa connessione HTTP/2 verso la stessa origin, costo marginale trascurabile), poi risolve:

```js
const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
```

`siteConfig.r2PublicUrl` (la vecchia var Vite) **resta** — diventa il fallback silenzioso, stesso pattern già usato ovunque nel progetto per `site.json`/bio/social (asymmetric fallback: se il runtime fallisce, degrado silenzioso al valore di build). Nessuna funzione pura esistente (`resolveSiteContent`, `albumsToCards`, `photosFromManifest`) cambia firma — vengono alimentate con il valore già risolto, passato come `buildConfig.r2PublicUrl` sovrascritto (`{ ...siteConfig, r2PublicUrl }`) dove serve. Zero test esistenti di quelle funzioni pure da riscrivere.

`contatti.js` non renderizza foto/hero, ma riceve comunque `fetchConfig()` per coerenza (evita un'eccezione silenziosa nel pattern che qualcuno potrebbe copiare in futuro).

## Contro-review di una proposta esterna (merge in un unico endpoint "BFF")

Una proposta alternativa suggeriva di unire `r2PublicUrl` dentro la risposta di `/api/data/site` (pattern "Backend-For-Frontend", per ridurre le richieste HTTP e migliorare il First Contentful Paint). Verificata e respinta per due motivi concreti:

1. **Il costo HTTP non esiste nella forma descritta**: la fetch è già dentro un `Promise.all` esistente, sulla stessa origin — con HTTP/2 (servito da Cloudflare) le richieste parallele condividono la connessione già aperta, nessun nuovo handshake TCP/TLS. Il costo reale è qualche centinaio di byte su uno stream già multiplexato.
2. **Il merge non riduce la superficie di errore, la aumenta**: con endpoint separati, un fallimento di `/api/data/config` degrada in silenzio (fallback a `siteConfig.r2PublicUrl`) senza toccare la risoluzione di `site.json`, e viceversa. Unendoli, un problema in uno dei due farebbe fallire entrambi insieme.

Punto valido della proposta, incorporato nel ragionamento: la distinzione storage-layer (R2 deve restare puro) vs transport-layer (il Worker come BFF può aggregare nella risposta) è corretta in astratto. Ma nel codice specifico di questo progetto il costo di implementarla è concreto (rottura dell'handler generico, nuovo path di errore server-side) — non giustificato per un singolo campo stringa.

## Fuori scope

- Rimozione di `VITE_R2_PUBLIC_URL`/`siteConfig.r2PublicUrl`: resta come fallback, stesso principio delle altre var di build già mantenute per la degradazione silenziosa.
- Valori reali di `R2_PUBLIC_URL` in `wrangler.json`: lasciati vuoti dove non ancora noti (produzione — Task 14 non eseguito; staging — l'utente fornirà l'URL pubblico reale del bucket quando pronto), stesso pattern già usato per `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`.
