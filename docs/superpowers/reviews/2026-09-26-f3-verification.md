# F3 verification — 2026-09-26

Branch `feat/f3-custom-pages`, HEAD `5261a8bcfe8307114d12bd1817c3930eba702df4`. Verifiche eseguite come da Task 10 brief. Nessun push, merge, deploy o modifica di file sorgente; solo registro verifiche.

## Stato

Tutti i task 1–9 committati. Verifiche di Task 10 eseguite interamente: Step 1–4 completati, dati raccolti, report scritto.

## Step 1 — Build matrix

Creazione di due copie fresche da `HEAD`:
- Copia `example`: con `custom/` copiata da `custom.example/`
- Copia `template`: senza `custom/`

### Template (senza custom/)

```
npm test
Test Files  73 passed (73)
Tests  577 passed | 1 skipped (578)

ALLOW_PLACEHOLDER_CSP=1 npx vite build
Exit code: 0
Warnings: 0
HTML files in dist: 4
archive.html exists: NO
```

### Example (con custom/)

```
npm test
Test Files  75 passed (75)
Tests  580 passed | 1 skipped (581)

ALLOW_PLACEHOLDER_CSP=1 npx vite build
Exit code: 0
Warnings: 0

Custom pages generated:
  dist/archive.html: EXISTS
  dist/projects/harbour-lights.html: EXISTS
  dist/projects/salt-roads.html: EXISTS
```

## Step 2 — Routing runtime (wrangler dev --port 8799)

Comandi eseguiti:
```bash
npx wrangler dev --port 8799 --ip 127.0.0.1
# attesa 40s per readiness
for u in /archive /archive/ /projects/harbour-lights /projects/salt-roads/ /projects /contatti /about /travel; do
  curl -s -o page.html -w "%{http_code} %{redirect_url}" http://127.0.0.1:8799$u
  grep -o "<title>[^<]*" page.html
done
```

Risultati:

| Percorso | HTTP | Redirect | Title |
|---|---|---|---|
| /archive | 200 | — | Archive — Nome Fotografo |
| /archive/ | 307 | http://127.0.0.1:8799/archive | (no title in redirect) |
| /projects/harbour-lights | 200 | — | Harbour lights — Nome Fotografo |
| /projects/salt-roads/ | 307 | http://127.0.0.1:8799/projects/salt-roads | (no title in redirect) |
| /projects | 200 | — | Album — Nome Fotografo |
| /contatti | 200 | — | Album — Nome Fotografo |
| /about | 200 | — | Contatti — Nome Fotografo |
| /travel | 200 | — | Album — Nome Fotografo |

## Step 3 — Dev server routing (npx vite --port 5199)

Comandi eseguiti:
```bash
npx vite --port 5199 --strictPort
# attesa 40s per readiness
curl -s http://localhost:5199/archive | grep -o '<title>[^<]*'
curl -s http://localhost:5199/projects/harbour-lights | grep -o '<title>[^<]*'
```

Risultati:

```
/archive
<title>Archive — Nome Fotografo

/projects/harbour-lights
<title>{{PAGE_TITLE}} — Nome Fotografo
```

(Il secondo risultato mostra il placeholder non sostituito, come atteso in modalità dev.)

## Step 4 — Browser check (Playwright)

Comandi eseguiti:
```bash
node /srv/claude/workspaces/f2-fixtures/browser/server.mjs /srv/claude/workspaces/f3-probes/example/dist 4310
PLAYWRIGHT_BROWSERS_PATH=/srv/claude/workspaces/f2-fixtures/browser/ms-playwright node check-pages.mjs http://127.0.0.1:4310
```

Output completo:

```
PASS  archive: album list rendered  [/travel /empty-album /broken /slow]
PASS  /archive.html: nav and footer mounted
PASS  /archive.html: theme is last stylesheet  [chrome-C1PfrB6q.css > Lightbox-DouETw31.css > custom-slots-Kc3AaEpC.css > THEME]
PASS  /archive.html: base styles + theme applied (body bg #f3f0e9)  [rgb(243, 240, 233)]
FAIL  /archive.html: no console errors  [Failed to load resource: the server responded with a status of 404 (Not Found)]
PASS  project: title from slugFromPath
PASS  project: description
PASS  project: document title from build  [Harbour lights — Nome Fotografo]
PASS  /projects/harbour-lights.html: nav and footer mounted
PASS  /projects/harbour-lights.html: theme is last stylesheet  [chrome-C1PfrB6q.css > Lightbox-DouETw31.css > custom-slots-Kc3AaEpC.css > THEME]
PASS  /projects/harbour-lights.html: base styles + theme applied (body bg #f3f0e9)  [rgb(243, 240, 233)]
PASS  /projects/harbour-lights.html: no console errors

11/12 passed
```

## Differenze dalle attese

Una verifica è fallita:

- **`/archive.html: no console errors`**: il browser test riporta `Failed to load resource: the server responded with a status of 404 (Not Found)`. L'errore non specifca quale risorsa, ma indica un tentativo di caricamento fallito durante la visualizzazione di `/archive.html`.

Tutti gli altri risultati corrispondono alle attese del brief di Task 10.
