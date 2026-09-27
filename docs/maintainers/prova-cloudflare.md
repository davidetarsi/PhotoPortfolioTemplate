# Prova su un account Cloudflare reale

Verifica, con un deploy vero, le parti che i test non possono coprire: **S4+U7** (dominio collegato dal deploy, `workers.dev` spento) e **D** (`npm run setup`, `npm run setup:secrets`), insieme a S2 (bucket privato dei messaggi) e al percorso completo del README. Tutto su risorse di prova, da cancellare alla fine.

Tempo stimato: 45–60 minuti. Parti dal branch `feat/simplify-l-english`, che contiene tutto.

Per ogni passo: spunta la casella; se qualcosa non va, annota il numero del passo e il messaggio esatto. Mi basta quello per correggere.

## 0. Cosa ti serve

- [ ] Un dominio già su Cloudflare, di cui usare un **sottodominio di prova** (es. `prova-portfolio.tuodominio.it`): non tocca il sito vero.
- [ ] Node.js 22.12+ e Terraform 1.9+ sul tuo computer (`node --version`, `terraform -version`).
- [ ] Il nome del tuo team Zero Trust (`<team>.cloudflareaccess.com`: dashboard → Zero Trust → Settings).
- [ ] Un token API con i permessi del [runbook, sezione 2](../runbook-cloudflare.md#2-cloudflare-api-token): *Workers R2 Storage: Edit*, *Access: Apps and Policies: Edit*, *Turnstile: Edit*. Durata breve.

## 1. Repository di prova

Crea su GitHub un repository **privato** vuoto, es. `portfolio-prova`. Poi, sul tuo computer:

```bash
git clone -b feat/simplify-l-english https://github.com/davidetarsi/PhotoPortfolioTemplate.git portfolio-prova
cd portfolio-prova
git checkout -b main
git remote set-url origin https://github.com/<tuo-utente>/portfolio-prova.git
npm install
npm test          # atteso: tutto verde
```

- [ ] `npm test` verde.

L'indirizzo HTTPS non richiede una chiave SSH: al primo push Git chiede di accedere a GitHub (con `gh auth login` o Git Credential Manager; come password non vale quella dell'account, serve un token).

## 2. `npm run setup` (fase D)

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
```

Compila `infra/terraform.tfvars` così (il resto lascialo com'è):

```hcl
account_id         = "<il tuo account id>"
project_name       = "portfolio-prova-2609"
access_team_domain = "<team>.cloudflareaccess.com"
prod_hostname      = "prova-portfolio.tuodominio.it"
admin_emails       = ["<la tua email>"]
enable_staging     = false
enable_turnstile   = true
```

Esporta il token senza lasciarlo nella cronologia, poi lancia il setup:

```bash
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN
npm run setup
```

- [ ] **Prima prova dei prerequisiti:** se lanci `npm run setup` in una shell *senza* token, si ferma subito con un messaggio che dice cosa manca (poi riprova con il token).
- [ ] Il piano mostrato da `terraform apply` contiene **solo creazioni**: due bucket (`portfolio-prova-2609` e `portfolio-prova-2609-messages`), il dominio `r2.dev` del **solo** bucket delle foto, l'applicazione e la policy di Access, il widget Turnstile. Rispondi `yes`.
- [ ] Alla fine stampa "wrangler.json is ready" con i tre passi successivi.
- [ ] `wrangler.json` contiene: due `r2_buckets` (`BUCKET` e `MESSAGES_BUCKET`), `"routes": [{ "pattern": "prova-portfolio.tuodominio.it", "custom_domain": true }]`, `"workers_dev": false`, `"preview_urls": false`, e **nessun** secret (`grep -i secret wrangler.json` non stampa niente).
- [ ] `infra/outputs.json` non esiste o non contiene `turnstile_secret`.

## 3. Commit e deploy (S4+U7)

```bash
git add wrangler.json
git commit -m "chore: configurazione di prova"
git push -u origin main
```

Dashboard Cloudflare → **Workers & Pages → Create → Import a repository** → `portfolio-prova`:

- Project name: `portfolio-prova-2609` (il `name` di `wrangler.json`; Cloudflare propone `portfolio-prova`, il nome del repository)
- Build command: `npm test && npm run build`
- Build output directory: `dist`
- Production branch: `main`

Il repository può restare privato. Se non compare nell'elenco, l'app GitHub di Cloudflare ha accesso solo ad alcuni repository: GitHub → Settings → Applications → **Cloudflare Workers and Pages** → Configure → Repository access → aggiungi `portfolio-prova` e salva, poi ricarica la pagina di Cloudflare.

- [ ] Il primo deploy termina senza errori. **Se fallisce sul custom domain** (permessi), annota il messaggio: è proprio una delle cose da verificare.
- [ ] Worker → **Settings → Domains & Routes**: c'è `prova-portfolio.tuodominio.it` come custom domain, **senza averlo aggiunto a mano** (U7).
- [ ] Nella stessa pagina, l'indirizzo `workers.dev` è disattivato (S4).
- [ ] `https://prova-portfolio.tuodominio.it` mostra il sito con "Photographer Name" e l'album di esempio.
- [ ] `https://<worker>.<account>.workers.dev` **non** risponde.

## 4. `npm run setup:secrets` (fase D)

Il token del passo 2 non ha i permessi sui Worker e, finché è esportato, Wrangler usa quello invece del tuo login: toglilo prima.

```bash
unset CLOUDFLARE_API_TOKEN
npx wrangler login
npm run setup:secrets
```

- [ ] Stampa che `TURNSTILE_SECRET` è su una nuova versione (se invece si ferma chiedendo di digitare il valore, annotalo: vuol dire che `wrangler versions secret put` non legge dalla pipe).
- [ ] Worker → **Deployments**: promuovi la nuova versione (o fai un commit vuoto e push).

## 5. Contatti e messaggi (D, S2)

- [ ] Pagina **About** → invia un messaggio di prova: risposta di successo.
- [ ] R2 → bucket `portfolio-prova-2609-messages`: c'è un oggetto in `_messages/`. Nel bucket delle foto `portfolio-prova-2609` **non** c'è `_messages/`.
- [ ] Il bucket `-messages` **non** ha un dominio pubblico (Settings → Public access: disabilitato).

## 6. Dashboard (fase A)

- [ ] Apri `https://prova-portfolio.tuodominio.it/admin`: Access chiede l'email e manda il codice; entri.
- [ ] La dashboard si apre **senza** aver lanciato `npm run migrate` (nessun "Could not load the albums").
- [ ] Crea un album, carica 2 foto, salva la sezione del sito: la home mostra il nuovo album al posto di quello di esempio.
- [ ] Sezione **Messages**: c'è il messaggio del passo 5, mostrato come testo.

## 7. Pulizia

- [ ] Svuota i due bucket dalla dashboard R2 (foto e messaggi).
- [ ] Riesporta il token (`read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN`): `terraform destroy` ne ha bisogno.
- [ ] Segui il [runbook, "Smoke cleanup"](../runbook-cloudflare.md#smoke-cleanup-and-the-r2dev-limitation) per `terraform destroy` (compreso il `terraform state rm` del dominio `r2.dev`).
- [ ] Elimina il Worker `portfolio-prova-2609` dalla dashboard e il repository GitHub di prova.
- [ ] `unset CLOUDFLARE_API_TOKEN` e revoca il token.

## 8. Cosa mandarmi

L'elenco dei passi non spuntati, ciascuno con il messaggio esatto o uno screenshot. Se è tutto spuntato: S4+U7 e D sono verificati e le PR si possono unire (prima quella della semplificazione nel branch dell'audit, poi l'audit in `main`).
