# Roadmap — semplificazione del template

Approvata dal maintainer il 2026-09-26: realizzare tutte le proposte di `pending-decisions.md`. Obiettivo: da 8 passi di installazione a circa 4 (fork → `npm run setup` → collega Git su Cloudflare → apri `/admin`).

## Regola per ogni fase

Ogni modifica che cambia qualcosa descritto nel README aggiorna, nello stesso piano, **README.md e README.it.md** (e le guide in `docs/` che ne parlano). Nessuna fase è chiusa se i due README non descrivono lo stato reale.

## Fasi

Ogni fase ha il proprio piano in `docs/maintainers/superpowers/plans/`, scritto appena prima di eseguirla perché dipende dallo stato lasciato dalla precedente. Ognuna parte dal branch della precedente.

| Fase | Contenuto | README | Stato |
|---|---|---|---|
| **A** | La dashboard parte senza `migrate`: `albums.json` assente = lista vuota, il primo salvataggio crea i dati. `migrate` resta come strumento facoltativo. In più: "Account GitHub o GitLab" nei requisiti | passi 6–7, requisiti, "Errori da evitare", "Come si usa" | piano `2026-09-26-simplify-a-no-migrate.md` |
| **C** | `wrangler.json` non più tracciato nel template (solo `wrangler.example.json`); build e test ricadono sull'esempio; il fork aggiunge il suo. Assunzione: il template non viene pubblicato dal suo repository (nessuna demo online) | "Come partire e restare aggiornati", passo 2, "Errori da evitare", `docs/upgrading.md` (conflitto una tantum per i fork esistenti) | da pianificare |
| **E** | Font in un posto solo: un plugin Vite inserisce il link a Google Fonts in ogni pagina (template e custom) da un'unica configurazione | `CUSTOMIZING.md` (cambio font), passo 6, `docs/pages.md` | da pianificare |
| **T** | Template HTML sicuri: helper interno `html\`…\`` con escaping di default, adottato in admin e componenti | nessuno (interno); `CONTRIBUTING.md` | da pianificare |
| **D** | `npm run setup`: `terraform apply`, output letti direttamente, `wrangler.json` scritto, `TURNSTILE_SECRET` impostato. Richiede una prova su un account Cloudflare reale | passi 1, 2 e 5 uniti | da pianificare |
| **L** | Testi di default in inglese, italiano come preset in `config/` | requisiti ("lingua dell'interfaccia"), `CUSTOMIZING.md` | da pianificare |

## Verifiche su un account reale (a carico del maintainer)

- S4+U7: dominio collegato dal deploy, `workers.dev` spento, staging intatto, permessi di Workers Builds.
- D: l'intero `npm run setup` su un account di prova.
