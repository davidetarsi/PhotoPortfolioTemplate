# Piano di implementazione — Portfolio fotografico

Derivato dalla roadmap v2. Le milestone M0–M3 sono dettagliate a livello di task (pronte da trasformare in GitHub Issues); M4–M7 restano volutamente a grana grossa e andranno dettagliate quando ci arrivi, con ciò che avrai imparato nel frattempo.

Ogni task ha una **DoD** (Definition of Done): il criterio oggettivo per dirla conclusa.

---

## M0 — Progetto in piedi (≈ 1 sessione)

**Obiettivo:** repo funzionante con dev server e struttura delle cartelle.

- [ ] **M0.1** Installare Node.js LTS + creare progetto Vite vanilla (`npm create vite@latest`).
      DoD: `npm run dev` mostra la pagina di default nel browser.
- [ ] **M0.2** Creare la struttura di cartelle del boilerplate (`config/`, `theme/`, `src/pages|providers|components|styles/`, `public/`) con file segnaposto vuoti.
      DoD: struttura committata, `npm run build` passa.
- [ ] **M0.3** Configurare Vite in modalità multipagina: entry `index.html`, `album.html`, `contatti.html`.
      DoD: le 3 pagine (anche vuote) si aprono in dev e compaiono in `dist/` dopo la build.
- [ ] **M0.4** Init Git + repo GitHub (privato per ora) + `.gitignore` Node.
      DoD: primo push fatto.
- [ ] **M0.5** `README.md` iniziale: comandi, struttura, decisioni prese (Drive come storage, ecc.).
      DoD: un altro dev capirebbe come avviare il progetto.

## M1 — Provider Google Drive (≈ 2–4 sessioni)

**Obiettivo:** modulo riusabile che, dato un folderId, restituisce le foto. Migra il codice del PoC (`galleria-drive-poc.html`) nella struttura vera.

- [ ] **M1.1** Setup Google Cloud: progetto, Drive API abilitata, API key. Cartella Drive di test condivisa "chiunque con il link".
      DoD: la chiamata REST da browser risponde con la lista file.
- [ ] **M1.2** `src/providers/provider.js`: contratto del provider (`listPhotos(albumRef) → [{name, gridUrl, fullUrl}]`).
      DoD: interfaccia documentata con JSDoc.
- [ ] **M1.3** `src/providers/googleDrive.js`: implementazione con paginazione (`pageToken`), ordinamento per nome, filtro mimeType immagine, gestione suffissi `=sNNN` dei thumbnail.
      DoD: funziona con una cartella di 150+ foto (oltre una pagina API).
- [ ] **M1.4** Gestione errori tipizzata (key non valida, cartella non trovata/non pubblica, rete) con messaggi riusabili dalla UI.
      DoD: ogni scenario di errore testato a mano produce il messaggio giusto.
- [ ] **M1.5** Cache in `sessionStorage` per folderId con scadenza (es. 10 min).
      DoD: seconda visita a un album non rifà la chiamata API (verificato nel network tab).

## M2 — Config e theming (≈ 2 sessioni)

**Obiettivo:** contenuti e aspetto interamente pilotati da `config/` e `theme/`.

- [ ] **M2.1** `config/site.config.js` (identità, social, provider), `config/albums.config.js` (slug, titolo, descrizione, folderId, cover), `config/texts.config.js` (testi delle pagine).
      DoD: nessuna stringa di contenuto hardcoded nelle pagine.
- [ ] **M2.2** Validazione config all'avvio (slug duplicati, campi mancanti) con errori chiari in console.
      DoD: config rotta di proposito → errore che dice esattamente cosa e dove.
- [ ] **M2.3** `theme/tokens.css` (colori, font, spazi, raggi) + `theme/typography.css` (scala e import font). Il CSS in `src/styles/` consuma solo tokens.
      DoD: cambiando 3 variabili il sito cambia visibilmente ovunque; `grep` di valori esadecimali in `src/styles/` non trova nulla.
- [ ] **M2.4** Scelta dello stile di riferimento tra i 4 mockup (o mix) e trascrizione dei suoi valori nei tokens.
      DoD: decisione annotata nel README con motivazione.

## M3 — Componenti galleria (≈ 3–5 sessioni)

**Obiettivo:** i mattoni visivi riusabili da landing e pagina album.

- [ ] **M3.1** Componente griglia/mosaico con lazy loading e skeleton.
      DoD: 100 foto scorrono fluide su smartphone di fascia media.
- [ ] **M3.2** Componente lightbox: tastiera, swipe, focus trap, chiusura con ESC/tap fuori.
      DoD: navigabile interamente da tastiera; testato su iOS e Android.
- [ ] **M3.3** Componente card album (cover, titolo, meta) per la landing.
      DoD: le card si generano iterando `albums.config.js`.
- [ ] **M3.4** Header/footer condivisi generati dalla config.
      DoD: aggiungere una voce di navigazione = una riga in config.

## M4 — Pagine (grana grossa, dettagliare a fine M3)

Landing (hero + card album) · Pagina album via `?album=slug` con 404 gentile · Contatti con form (Web3Forms/Formspree + honeypot). 

## M5 — Deploy

Cloudflare Pages collegato al repo, build automatica, dominio.

## M6 — Hardening

Restrizione API key per referrer · file `_headers` con CSP · audit foto pubbliche · revisione dipendenze.

## M7 — Boilerplate

Template repository · `CUSTOMIZING.md` · prova generale: sito-clone da zero in < 30 minuti.

---

## Regole di lavoro che ti suggerisco

1. **Una milestone alla volta, in ordine.** M1 è il rischio tecnico più grosso del progetto: se Drive non regge come pensiamo, meglio saperlo prima di aver scritto la UI.
2. **Committa per task**, con lo stesso ID (es. `M1.3: paginazione provider Drive`). Lo storico diventa la documentazione del progetto.
3. **Non dettagliare M4–M7 adesso.** Li pianificherai meglio dopo M3, quando saprai cose che oggi non sai.
4. **Definisci "fatto" prima di iniziare un task**, non dopo: se una DoD ti sembra sbagliata, cambiala prima di scrivere codice.
5. Se un task supera il doppio della stima, fermati e spezzalo: è il segnale che nasconde due problemi.
