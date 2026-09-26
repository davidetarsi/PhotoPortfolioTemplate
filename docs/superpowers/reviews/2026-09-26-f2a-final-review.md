# F2a final review — 2026-09-26

## Esito

F2a è integrata nel `main` locale con merge commit `8f3b4d8785fa840c5c311a73390c398c5721dee0` (parent `e609df7`, branch sorgente `2fe94d2ef78f6fa35349ae4dbc56e0e0eb8243d0`). API, esempio, test e documentazione risultano coerenti; non sono emerse regressioni funzionali nel diff `09b6954..13bd30f`. Non è stato eseguito push né deploy.

## Rilievi risolti

- **Discovery Vitest in `.worktrees`**: in `vite.config.js`, `test.exclude` era assente. La discovery ricorsiva dalla root raccoglieva anche test in worktree annidati; il checkout root aveva mostrato 257 file. Aggiunta l’esclusione `**/.worktrees/**`, preservando `configDefaults.exclude` di Vitest e senza nuove dipendenze.
- **Prova comportamentale**: una fixture temporanea `.worktrees/discovery-probe/nested-probe.test.js` con il Vitest reale compariva nella lista prima della correzione (RED, 60 file) e spariva dopo (GREEN, 59 file). La fixture è stata rimossa; nessun test persistente basato sul testo della configurazione.
- **Stato della spec**: ora distingue F4/F1 nel `main` locale `e609df7` da F2a sul branch locale `feature/f2a-public-api` a `13bd30f`, in attesa di merge. Non sono stati verificati remoti o deploy.

## Verifiche

- Sul commit `13bd30f`, il maintainer ha verificato `custom.example/` copiata in una directory temporanea `custom/`: `npm test` 60 file, 472 passati, 1 saltato; build con `ALLOW_PLACEHOLDER_CSP=1` riuscita.
- Sul worktree finale dopo l’esclusione: `npm test` 59 file, 470 passati, 1 saltato; `ALLOW_PLACEHOLDER_CSP=1 npm run build` riuscita.
- Sul merge `8f3b4d8785fa840c5c311a73390c398c5721dee0` in `main`: `npm test` 59 file, 470 passati, 1 saltato; `ALLOW_PLACEHOLDER_CSP=1 npm run build` riuscita; `git diff --check` pulito.
- Il maintainer ha confermato in modo indipendente suite (59 file, 470 passati, 1 saltato) e build riuscite sullo stesso merge.
- `git diff --check` passato prima del commit.

## Note minori

- La landing di esempio rende un `<ul>` vuoto quando `albums` è `[]`; resta senza messaggio dedicato. È una scelta di contenuto/design, fuori dal fix F2a, e non blocca il merge.
- Il test dell’esempio copre link e immagine assente/presente; la regola CSS anti-marker è stata verificata nel render browser riportato in `.superpowers/sdd/progress.md`, non da un’asserzione automatizzata sul CSS.

## Perimetro escluso

Nessuna modifica o review dell’implementazione futura F2, nessun framework React nel template, nessun deploy, push, pull o rimozione di worktree/branch. Il worktree corrente è stato spostato sul `main` locale; il branch `feature/f2a-public-api` resta disponibile.
