# Punto 1 — Terraform e configurazione generata — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descrivere l'infrastruttura Cloudflare in Terraform e far generare da lì `wrangler.json` e la CSP, eliminando i valori scolpiti a mano che oggi rendono il template inutilizzabile da chiunque non sia il suo autore.

**Architecture:** Una catena a due anelli. Terraform possiede le risorse d'account (bucket R2, domini pubblici, applicazioni Access) ed emette i valori che ne risultano; uno script rende `wrangler.json` da `wrangler.example.json` più quei valori; un plugin Vite genera `dist/_headers` leggendo `wrangler.json`. Il secondo anello funziona anche senza il primo: chi compila `wrangler.json` a mano seguendo il runbook ottiene comunque la CSP corretta. Terraform **non** dichiara il Worker, che resta di `wrangler deploy`.

```
terraform apply → infra/outputs.json ─┐
                                      ├→ wrangler.json → dist/_headers
        runbook manuale ──────────────┘
```

**Tech Stack:** Terraform (provider `cloudflare/cloudflare` v5), Node 20+, Vite 8, vitest.

**Spec:** [docs/superpowers/specs/2026-09-20-template-distribuibile-analisi.md](../specs/2026-09-20-template-distribuibile-analisi.md) — §3 per intero, più i punti 2 e 3 dell'[audit di luglio](../specs/2026-07-12-boilerplate-template-audit.md).

## Global Constraints

Dal `CLAUDE.md` di `/srv/claude/workspaces/`:

- **Mai `git push --force`**, mai cancellare rami remoti, mai `--no-verify`. Push bloccato → fermarsi e segnalare, non aggirare.
- **Mai committare su `main`.** Branch dedicato e PR; il merge lo decide una persona.
- Si lavora solo dentro `/srv/claude/workspaces/`. Ogni file cancellato va dichiarato, con il motivo.
- **Non leggere, copiare o stampare credenziali.** Vale per il token API Cloudflare del Task 2: vive in una variabile d'ambiente, non finisce mai in un file versionato né a schermo.
- Identità commit `VPS Agent <agent@vps-agent.invalid>`, già globale.

Ogni commit termina con:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Vincoli tecnici specifici di questo punto:

- **Stato Terraform locale**, come deciso (analisi §3.3). `infra/terraform.tfstate*` non va mai versionato.
- **Terraform non dichiara `cloudflare_workers_script`.** Il deploy resta della Git integration Cloudflare. Dichiararlo farebbe sovrascrivere le due parti a vicenda ad ogni deploy (analisi §3.2).
- **Il provider va pinnato a una versione esatta.** `cloudflare_zero_trust_access_application` è segnalata come non idempotente in alcune versioni v5: un `apply` ripetuto può produrre modifiche spurie.
- Branch di lavoro: `punto1-terraform`, creato da `bootstrap-architettura-r2` (la cui PR potrebbe non essere ancora mergiata — vedi [azioni-manuali](../../azioni-manuali.md) voce 1).

## Stato di partenza verificato

- `terraform` **non è installato** su questa macchina: il Task 1 lo installa.
- Produzione: zona reale `portfolio.example`, Access limita `/admin` e `/api/admin`, il resto è pubblico.
- Staging: dominio `workers.dev`, Access non può fare path-scoping quindi protegge tutto il dominio.
- Deploy: Git integration nativa Cloudflare, branch `main` → Worker `photo-portfolio`, branch `staging` → `photo-portfolio-staging`. **Non gestibile da Terraform**: va nel runbook.
- `public/_headers` oggi è statico con due URL R2 segnaposto (li ha messi il bootstrap).

---

## File Structure

| File | Responsabilità |
|---|---|
| `infra/versions.tf` | pin di Terraform e del provider |
| `infra/variables.tf` | input: account, nome progetto, hostname, email ammesse, dominio custom opzionale |
| `infra/r2.tf` | bucket produzione e staging, domini pubblici |
| `infra/access.tf` | applicazioni Access e policy, per i due ambienti |
| `infra/outputs.tf` | i valori che servono a `wrangler.json` |
| `infra/terraform.tfvars.example` | esempio compilabile |
| `infra/.gitignore` | esclude stato, `.terraform/`, `*.tfvars`, `outputs.json` |
| `scripts/gen-wrangler.js` | CLI: outputs Terraform + esempio → `wrangler.json` |
| `src/utils/renderWrangler.js` | funzione pura, testata: (esempio, outputs) → oggetto config |
| `src/utils/buildHeaders.js` | funzione pura, testata: config → contenuto di `_headers` |
| `vite.config.js` | plugin che scrive `dist/_headers` a build time |
| `docs/runbook-cloudflare.md` | percorso manuale, equivalente al `.tf` |
| `public/_headers` | **cancellato**: ora è generato |

---

### Task 1: Impalcatura Terraform e schema verificato

Nessuna risorsa creata. Serve a lavorare sullo schema **reale** del provider invece che a memoria: i nomi dei campi di `cloudflare_zero_trust_access_application` sono cambiati tra le versioni e non vanno indovinati.

**Files:**
- Create: `infra/versions.tf`, `infra/.gitignore`
- Create: `/tmp/.../scratchpad/provider-schema.md` (appunti, fuori dal repo)

**Interfaces:**
- Consumes: niente
- Produces: i nomi esatti dei campi usati dai Task 2 e 3

- [ ] **Step 1: Installare Terraform**

```bash
cd /tmp && curl -fsSL https://releases.hashicorp.com/terraform/1.14.3/terraform_1.14.3_linux_amd64.zip -o tf.zip \
  && unzip -o tf.zip terraform -d "$HOME/.local/bin" && rm tf.zip
export PATH="$HOME/.local/bin:$PATH"
terraform version
```

Atteso: `Terraform v1.14.3` o superiore. Se la rete è bloccata: fermarsi e segnalare.

- [ ] **Step 2: Creare il branch**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git checkout bootstrap-architettura-r2
git checkout -b punto1-terraform
```

- [ ] **Step 3: Scrivere il pin del provider**

`infra/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.13.0"
    }
  }
}

provider "cloudflare" {
  # Il token si legge da CLOUDFLARE_API_TOKEN nell'ambiente.
  # Non va mai scritto qui né in un file .tfvars versionato.
}
```

- [ ] **Step 4: Escludere stato e segreti dal versionamento**

`infra/.gitignore`:

```gitignore
.terraform/
.terraform.lock.hcl
terraform.tfstate
terraform.tfstate.*
*.tfvars
!terraform.tfvars.example
outputs.json
```

- [ ] **Step 5: Scaricare il provider ed estrarne lo schema**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate/infra
terraform init
terraform providers schema -json > /tmp/schema.json
```

Atteso: `Terraform has been successfully initialized`.

- [ ] **Step 6: Annotare i campi delle risorse che servono**

```bash
for r in cloudflare_r2_bucket cloudflare_r2_managed_domain cloudflare_r2_custom_domain \
         cloudflare_zero_trust_access_application cloudflare_zero_trust_access_policy; do
  echo "=== $r ==="
  node -e '
    const s=require("/tmp/schema.json");
    const p=s.provider_schemas["registry.terraform.io/cloudflare/cloudflare"].resource_schemas[process.argv[1]];
    if(!p){console.log("NON TROVATA");process.exit(0)}
    const b=p.block;
    for(const [k,v] of Object.entries(b.attributes||{}))
      console.log(` ${k}: ${v.required?"OBBLIGATORIO":v.computed&&!v.optional?"output":"opzionale"}`);
    for(const k of Object.keys(b.block_types||{})) console.log(` [blocco] ${k}`);
  ' "$r"
done
```

Copiare l'output nello scratchpad. **Serve in particolare:** come `cloudflare_zero_trust_access_application` accetta gli hostname (campo `domain` singolo oppure blocco `destinations` con più voci) e con che nome esporta l'AUD. I Task 2 e 3 usano questi nomi, non quelli che sembrano plausibili.

- [ ] **Step 7: Verificare la formattazione e committare**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
terraform -chdir=infra fmt -check
git add infra/
git commit -F - <<'EOF'
chore(infra): impalcatura Terraform con provider pinnato

Provider cloudflare/cloudflare pinnato a 5.13.0 esatto: in alcune
versioni v5 cloudflare_zero_trust_access_application non e idempotente
e un apply ripetuto produce modifiche spurie. Il token API si legge da
CLOUDFLARE_API_TOKEN, mai da file.

Stato locale come deciso nell'analisi: infra/.gitignore esclude
tfstate, .terraform/ e ogni .tfvars tranne l'esempio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Bucket R2 e domini pubblici

**Files:**
- Create: `infra/variables.tf`, `infra/r2.tf`, `infra/terraform.tfvars.example`

**Interfaces:**
- Consumes: i nomi dei campi annotati nel Task 1 Step 6
- Produces: risorse `cloudflare_r2_bucket.prod` / `.staging` e `cloudflare_r2_managed_domain.prod` / `.staging`, consumate da `infra/outputs.tf` nel Task 4

- [ ] **Step 1: Dichiarare le variabili**

`infra/variables.tf`:

```hcl
variable "account_id" {
  type        = string
  description = "ID dell'account Cloudflare. Dashboard → barra laterale destra."
}

variable "project_name" {
  type        = string
  description = "Prefisso di bucket e Worker, es. 'mario-portfolio'. Minuscole e trattini."

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Solo minuscole, cifre e trattini."
  }
}

variable "prod_hostname" {
  type        = string
  description = "Hostname pubblico di produzione, es. 'mario.com' oppure 'mario-portfolio.xxx.workers.dev'."
}

variable "staging_hostname" {
  type        = string
  description = "Hostname di staging, tipicamente su workers.dev. Noto solo dopo il primo deploy: vedi il runbook."
}

variable "admin_emails" {
  type        = list(string)
  description = "Email autorizzate alla dashboard admin."

  validation {
    condition     = length(var.admin_emails) > 0
    error_message = "Serve almeno un'email, altrimenti nessuno puo entrare nella dashboard."
  }
}

# Non e creato da Terraform: e il team Zero Trust dell'account, che esiste
# gia. Entra qui come variabile perche il Worker deve riceverlo in
# wrangler.json per validare i JWT di Access.
variable "access_team_domain" {
  type        = string
  description = "Team domain Zero Trust, senza https://, es. 'mario.cloudflareaccess.com'."

  validation {
    condition     = can(regex("^[a-z0-9-]+\\.cloudflareaccess\\.com$", var.access_team_domain))
    error_message = "Formato atteso: <team>.cloudflareaccess.com, senza schema."
  }
}

variable "custom_photo_domain" {
  type        = string
  default     = ""
  description = "Dominio custom per le foto, es. 'img.mario.com'. Vuoto = si usa r2.dev, che Cloudflare dichiara rate-limited e solo per sviluppo. Serve anche photo_domain_zone_id."
}

variable "photo_domain_zone_id" {
  type        = string
  default     = ""
  description = "Zone ID del dominio custom delle foto. Obbligatorio se custom_photo_domain e valorizzato."
}
```

- [ ] **Step 2: Dichiarare bucket e domini**

`infra/r2.tf`. **Prima di scrivere, confrontare i nomi dei campi con l'output del Task 1 Step 6** e correggerli se differiscono:

```hcl
resource "cloudflare_r2_bucket" "prod" {
  account_id = var.account_id
  name       = var.project_name
}

resource "cloudflare_r2_bucket" "staging" {
  account_id = var.account_id
  name       = "${var.project_name}-staging"
}

# Espone i bucket sul dominio gestito r2.dev. Rate-limited e senza cache:
# per la produzione vera si valorizza custom_photo_domain (vedi sotto).
resource "cloudflare_r2_managed_domain" "prod" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.prod.name
  enabled     = true
}

resource "cloudflare_r2_managed_domain" "staging" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.staging.name
  enabled     = true
}

# Opzionale: dominio custom sulle foto di produzione. Da'
# cache, WAF e controlli d'accesso, che r2.dev non ha.
resource "cloudflare_r2_custom_domain" "prod" {
  count = var.custom_photo_domain == "" ? 0 : 1

  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.prod.name
  domain      = var.custom_photo_domain
  zone_id     = var.photo_domain_zone_id
  enabled     = true
}
```

- [ ] **Step 3: Scrivere l'esempio di tfvars**

`infra/terraform.tfvars.example`:

```hcl
account_id         = "incolla-qui-l-id-del-tuo-account"
project_name       = "il-tuo-portfolio"
access_team_domain = "il-tuo-team.cloudflareaccess.com"

# Al primo apply puoi non conoscere ancora questi hostname: vedi il runbook,
# che spiega come applicare prima i soli bucket.
prod_hostname    = "iltuodominio.com"
staging_hostname = "il-tuo-portfolio-staging.xxxxx.workers.dev"

admin_emails = ["tu@esempio.it"]

# Consigliato prima di andare in produzione: r2.dev e rate-limited.
# custom_photo_domain  = "img.iltuodominio.com"
# photo_domain_zone_id = "incolla-qui-lo-zone-id"
```

- [ ] **Step 4: Validare**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
```

Atteso: `Success! The configuration is valid.`
Se `validate` segnala campi sconosciuti, i nomi vanno allineati allo schema del Task 1 Step 6.

- [ ] **Step 5: Commit**

```bash
git add infra/
git commit -F - <<'EOF'
feat(infra): bucket R2 e domini pubblici per i due ambienti

Due bucket e due domini gestiti r2.dev, piu un dominio custom
opzionale attivato da variabile. Il custom non e obbligatorio per
non alzare la barriera d'ingresso di chi vuole solo provare il
template, ma il runbook lo raccomanda prima della produzione:
Cloudflare dichiara r2.dev rate-limited e solo per sviluppo, senza
cache ne WAF.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Applicazioni Access

I due ambienti si configurano in modo **diverso**, e non è una svista: su una zona Cloudflare reale Access sa limitarsi a certi percorsi, su `workers.dev` no. In produzione si proteggono solo `/admin` e `/api/admin`; in staging si protegge tutto il dominio.

**Files:**
- Create: `infra/access.tf`

**Interfaces:**
- Consumes: variabili del Task 2, schema del Task 1
- Produces: `cloudflare_zero_trust_access_application.prod` / `.staging`, il cui attributo AUD viene esposto dal Task 4

- [ ] **Step 1: Dichiarare applicazioni e policy**

`infra/access.tf`. **I nomi dei campi vanno verificati contro lo schema del Task 1 Step 6**: in particolare se gli hostname si dichiarano con `domain` (uno solo) o con blocchi `destinations` (più di uno), e se le policy si collegano con un argomento `policies` sull'applicazione o con una risorsa separata.

```hcl
resource "cloudflare_zero_trust_access_policy" "solo_admin" {
  account_id = var.account_id
  name       = "${var.project_name} — admin"
  decision   = "allow"

  include = [{
    email = { email = var.admin_emails[0] }
  }]
}

# Produzione: zona reale, quindi Access si limita ai due percorsi admin
# e lascia pubblico tutto il resto del sito.
resource "cloudflare_zero_trust_access_application" "prod" {
  account_id       = var.account_id
  name             = "${var.project_name} admin (prod)"
  type             = "self_hosted"
  session_duration = "24h"

  destinations = [
    { type = "public", uri = "${var.prod_hostname}/admin" },
    { type = "public", uri = "${var.prod_hostname}/api/admin" },
  ]

  policies = [cloudflare_zero_trust_access_policy.solo_admin.id]
}

# Staging: dominio workers.dev, dove Access non sa fare path-scoping.
# Protegge tutto, ed e accettabile perche staging non ha pubblico.
resource "cloudflare_zero_trust_access_application" "staging" {
  account_id       = var.account_id
  name             = "${var.project_name} admin (staging)"
  type             = "self_hosted"
  session_duration = "24h"

  destinations = [
    { type = "public", uri = var.staging_hostname },
  ]

  policies = [cloudflare_zero_trust_access_policy.solo_admin.id]
}
```

Se `admin_emails` deve ammettere più di un indirizzo, la `include` va costruita con un `for` sulla lista invece di prendere solo il primo elemento. Farlo solo se lo schema del provider accetta più voci `email` nello stesso blocco.

- [ ] **Step 2: Validare**

```bash
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
```

Atteso: `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

```bash
git add infra/access.tf
git commit -F - <<'EOF'
feat(infra): applicazioni Access per produzione e staging

I due ambienti hanno configurazione diversa di proposito: su una zona
Cloudflare reale Access sa limitarsi a /admin e /api/admin lasciando
pubblico il resto, su workers.dev non sa fare path-scoping e protegge
tutto il dominio. E lo stesso assetto gia in uso, ora descritto invece
che configurato a mano dalla dashboard.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Output di Terraform

**Files:**
- Create: `infra/outputs.tf`

**Interfaces:**
- Consumes: risorse dei Task 2 e 3
- Produces: il JSON che `scripts/gen-wrangler.js` consuma nel Task 5. **Le chiavi qui definite sono il contratto**: `project_name`, `bucket_prod`, `bucket_staging`, `r2_public_url_prod`, `r2_public_url_staging`, `access_aud_prod`, `access_aud_staging`

- [ ] **Step 1: Dichiarare gli output**

`infra/outputs.tf`. L'attributo che espone il dominio gestito e quello che espone l'AUD vanno presi dallo schema del Task 1 Step 6:

```hcl
output "project_name" {
  value = var.project_name
}

output "bucket_prod" {
  value = cloudflare_r2_bucket.prod.name
}

output "bucket_staging" {
  value = cloudflare_r2_bucket.staging.name
}

# Se e stato configurato un dominio custom vince quello: e l'unico
# adatto alla produzione. Altrimenti si ripiega su r2.dev.
output "r2_public_url_prod" {
  value = var.custom_photo_domain != "" ? "https://${var.custom_photo_domain}" : "https://${cloudflare_r2_managed_domain.prod.domain}"
}

output "r2_public_url_staging" {
  value = "https://${cloudflare_r2_managed_domain.staging.domain}"
}

output "access_aud_prod" {
  value = cloudflare_zero_trust_access_application.prod.aud
}

output "access_aud_staging" {
  value = cloudflare_zero_trust_access_application.staging.aud
}

# Non nasce da una risorsa: rimanda alla variabile omonima. Sta qui
# perche gen-wrangler.js legge un unico file di output, e spezzare la
# sorgente in due significherebbe tenerne allineate due.
output "access_team_domain" {
  value = var.access_team_domain
}
```

- [ ] **Step 2: Validare**

```bash
terraform -chdir=infra fmt -check && terraform -chdir=infra validate
```

Atteso: `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

```bash
git add infra/outputs.tf
git commit -m "feat(infra): output che alimentano wrangler.json

Le sette chiavi qui definite sono il contratto con gen-wrangler.js.
r2_public_url_prod preferisce il dominio custom quando c'e: e l'unico
adatto alla produzione.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 5: Generare `wrangler.json` dagli output

Qui si scrive codice, quindi vale il ciclo TDD. La logica sta in una funzione pura testabile; lo script CLI è solo il guscio che legge e scrive file.

**Files:**
- Create: `src/utils/renderWrangler.js`, `src/utils/renderWrangler.test.js`, `scripts/gen-wrangler.js`
- Modify: `package.json` (nuovo script `infra:sync`)

**Interfaces:**
- Consumes: le sette chiavi del Task 4
- Produces: `renderWrangler(example, outputs) → object`, usata dal Task 6 come sorgente di `wrangler.json`

- [ ] **Step 1: Scrivere il test che fallisce**

`src/utils/renderWrangler.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderWrangler } from './renderWrangler.js';

const EXAMPLE = {
  name: 'il-tuo-portfolio',
  main: 'src/worker.js',
  r2_buckets: [{ binding: 'BUCKET', bucket_name: 'il-tuo-bucket' }],
  vars: { ACCESS_TEAM_DOMAIN: 'x', ACCESS_AUD: 'y', R2_PUBLIC_URL: 'z' },
  env: {
    staging: {
      name: 'il-tuo-portfolio-staging',
      r2_buckets: [{ binding: 'BUCKET', bucket_name: 'il-tuo-bucket-staging' }],
      vars: { ACCESS_TEAM_DOMAIN: 'x', ACCESS_AUD: 'y', R2_PUBLIC_URL: 'z' },
    },
  },
};

const OUTPUTS = {
  project_name: 'mario-portfolio',
  bucket_prod: 'mario-portfolio',
  bucket_staging: 'mario-portfolio-staging',
  r2_public_url_prod: 'https://img.mario.com',
  r2_public_url_staging: 'https://pub-bbb.r2.dev',
  access_aud_prod: 'aud-prod',
  access_aud_staging: 'aud-staging',
  access_team_domain: 'mario.cloudflareaccess.com',
};

describe('renderWrangler', () => {
  it('sostituisce nomi, bucket e vars di produzione', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS);
    expect(r.name).toBe('mario-portfolio');
    expect(r.r2_buckets[0].bucket_name).toBe('mario-portfolio');
    expect(r.vars.R2_PUBLIC_URL).toBe('https://img.mario.com');
    expect(r.vars.ACCESS_AUD).toBe('aud-prod');
    expect(r.vars.ACCESS_TEAM_DOMAIN).toBe('mario.cloudflareaccess.com');
  });

  it('sostituisce anche il blocco staging, con i suoi valori', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS);
    expect(r.env.staging.name).toBe('mario-portfolio-staging');
    expect(r.env.staging.r2_buckets[0].bucket_name).toBe('mario-portfolio-staging');
    expect(r.env.staging.vars.R2_PUBLIC_URL).toBe('https://pub-bbb.r2.dev');
    expect(r.env.staging.vars.ACCESS_AUD).toBe('aud-staging');
  });

  it('non muta l oggetto di esempio ricevuto', () => {
    const copia = structuredClone(EXAMPLE);
    renderWrangler(EXAMPLE, OUTPUTS);
    expect(EXAMPLE).toEqual(copia);
  });

  it('conserva i campi che non dipendono dall infrastruttura', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS);
    expect(r.main).toBe('src/worker.js');
  });

  it('fallisce con messaggio parlante se manca una chiave', () => {
    const { access_aud_prod, ...incompleti } = OUTPUTS;
    expect(() => renderWrangler(EXAMPLE, incompleti)).toThrow(/access_aud_prod/);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx vitest run src/utils/renderWrangler.test.js`
Atteso: FAIL, `Failed to resolve import "./renderWrangler.js"`.

- [ ] **Step 3: Implementare**

`src/utils/renderWrangler.js`:

```js
const CHIAVI_RICHIESTE = [
  'project_name', 'bucket_prod', 'bucket_staging',
  'r2_public_url_prod', 'r2_public_url_staging',
  'access_aud_prod', 'access_aud_staging', 'access_team_domain',
];

/**
 * Rende wrangler.json dai valori emessi da Terraform (o compilati a mano
 * seguendo il runbook). Funzione pura: non tocca l'oggetto ricevuto.
 *
 * @param {object} example - contenuto di wrangler.example.json
 * @param {Record<string,string>} outputs - le chiavi di infra/outputs.tf
 * @returns {object} configurazione pronta da scrivere
 */
export function renderWrangler(example, outputs) {
  const mancanti = CHIAVI_RICHIESTE.filter(k => !outputs[k]);
  if (mancanti.length > 0) {
    throw new Error(`Valori mancanti negli output: ${mancanti.join(', ')}`);
  }

  const out = structuredClone(example);

  out.name = outputs.project_name;
  out.r2_buckets[0].bucket_name = outputs.bucket_prod;
  out.vars.R2_PUBLIC_URL = outputs.r2_public_url_prod;
  out.vars.ACCESS_AUD = outputs.access_aud_prod;
  out.vars.ACCESS_TEAM_DOMAIN = outputs.access_team_domain;

  const st = out.env.staging;
  st.name = `${outputs.project_name}-staging`;
  st.r2_buckets[0].bucket_name = outputs.bucket_staging;
  st.vars.R2_PUBLIC_URL = outputs.r2_public_url_staging;
  st.vars.ACCESS_AUD = outputs.access_aud_staging;
  st.vars.ACCESS_TEAM_DOMAIN = outputs.access_team_domain;

  return out;
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx vitest run src/utils/renderWrangler.test.js`
Atteso: 5 test PASS.

- [ ] **Step 5: Scrivere il guscio CLI**

`scripts/gen-wrangler.js`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { renderWrangler } from '../src/utils/renderWrangler.js';

const ESEMPIO = 'wrangler.example.json';
const OUTPUTS = 'infra/outputs.json';
const DESTINAZIONE = 'wrangler.json';

if (!existsSync(OUTPUTS)) {
  console.error(`Manca ${OUTPUTS}. Generalo con:\n  terraform -chdir=infra output -json > ${OUTPUTS}`);
  process.exit(1);
}

// `terraform output -json` incapsula ogni valore in { value, type, sensitive }.
const grezzi = JSON.parse(readFileSync(OUTPUTS, 'utf8'));
const outputs = Object.fromEntries(
  Object.entries(grezzi).map(([k, v]) => [k, v?.value ?? v]),
);

const esempio = JSON.parse(readFileSync(ESEMPIO, 'utf8'));
writeFileSync(DESTINAZIONE, `${JSON.stringify(renderWrangler(esempio, outputs), null, 2)}\n`);
console.log(`Scritto ${DESTINAZIONE}.`);
```

Aggiungere a `package.json`, dentro `scripts`:

```json
    "infra:sync": "node scripts/gen-wrangler.js",
```

- [ ] **Step 6: Verificare il guscio con output finti**

```bash
mkdir -p infra
cat > infra/outputs.json <<'EOF'
{
  "project_name": {"value": "prova-portfolio"},
  "bucket_prod": {"value": "prova-portfolio"},
  "bucket_staging": {"value": "prova-portfolio-staging"},
  "r2_public_url_prod": {"value": "https://pub-aaa.r2.dev"},
  "r2_public_url_staging": {"value": "https://pub-bbb.r2.dev"},
  "access_aud_prod": {"value": "aud-p"},
  "access_aud_staging": {"value": "aud-s"},
  "access_team_domain": {"value": "prova.cloudflareaccess.com"}
}
EOF
cp wrangler.json /tmp/wrangler.json.bak 2>/dev/null || true
npm run infra:sync
node -e "const w=require('./wrangler.json'); console.log(w.name, w.vars.R2_PUBLIC_URL, w.env.staging.vars.ACCESS_AUD)"
```

Atteso: `prova-portfolio https://pub-aaa.r2.dev aud-s`.
Poi ripristinare: `cp /tmp/wrangler.json.bak wrangler.json` e `rm infra/outputs.json`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/renderWrangler.js src/utils/renderWrangler.test.js scripts/gen-wrangler.js package.json
git commit -F - <<'EOF'
feat(infra): genera wrangler.json dagli output di Terraform

La logica sta in una funzione pura testata; lo script CLI legge e
scrive soltanto. Se manca una chiave fallisce dicendo quale, invece di
produrre un wrangler.json con dentro un "undefined" che poi sbaglia il
deploy in modo oscuro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Generare la CSP a build time

Chiude il punto 2 dell'audit di luglio. La sorgente è `wrangler.json`, non Terraform: così la CSP resta corretta anche per chi ha seguito il runbook manuale.

**Files:**
- Create: `src/utils/buildHeaders.js`, `src/utils/buildHeaders.test.js`
- Modify: `vite.config.js`
- Delete: `public/_headers`

**Interfaces:**
- Consumes: l'oggetto `wrangler.json` prodotto dal Task 5
- Produces: `buildHeaders(config) → string`, scritta in `dist/_headers` dal plugin Vite

- [ ] **Step 1: Scrivere il test che fallisce**

`src/utils/buildHeaders.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildHeaders } from './buildHeaders.js';

const CONFIG = {
  vars: { R2_PUBLIC_URL: 'https://pub-aaa.r2.dev' },
  env: { staging: { vars: { R2_PUBLIC_URL: 'https://pub-bbb.r2.dev' } } },
};

describe('buildHeaders', () => {
  it('autorizza entrambe le origini R2 in img-src e connect-src', () => {
    const h = buildHeaders(CONFIG);
    expect(h).toContain('https://pub-aaa.r2.dev');
    expect(h).toContain('https://pub-bbb.r2.dev');
    const csp = h.split('\n').find(r => r.includes('Content-Security-Policy'));
    expect(csp).toMatch(/img-src[^;]*pub-aaa/);
    expect(csp).toMatch(/connect-src[^;]*pub-bbb/);
  });

  it('non ripete l origine quando prod e staging coincidono', () => {
    const h = buildHeaders({
      vars: { R2_PUBLIC_URL: 'https://pub-aaa.r2.dev' },
      env: { staging: { vars: { R2_PUBLIC_URL: 'https://pub-aaa.r2.dev' } } },
    });
    const csp = h.split('\n').find(r => r.includes('Content-Security-Policy'));
    expect(csp.match(/pub-aaa\.r2\.dev/g)).toHaveLength(2); // una in img-src, una in connect-src
  });

  it('mantiene l endpoint del form e le direttive di irrigidimento', () => {
    const h = buildHeaders(CONFIG);
    expect(h).toContain('https://api.web3forms.com');
    expect(h).toContain("frame-ancestors 'none'");
    expect(h).toContain('X-Content-Type-Options: nosniff');
    expect(h).toContain('Strict-Transport-Security');
  });

  it('funziona anche senza blocco staging', () => {
    const h = buildHeaders({ vars: { R2_PUBLIC_URL: 'https://pub-aaa.r2.dev' } });
    expect(h).toContain('https://pub-aaa.r2.dev');
  });

  it('fallisce con messaggio parlante se manca R2_PUBLIC_URL', () => {
    expect(() => buildHeaders({ vars: {} })).toThrow(/R2_PUBLIC_URL/);
  });

  it('rifiuta un segnaposto non sostituito', () => {
    expect(() => buildHeaders({ vars: { R2_PUBLIC_URL: 'https://pub-xxxxxxxx.r2.dev' } }))
      .toThrow(/segnaposto/);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx vitest run src/utils/buildHeaders.test.js`
Atteso: FAIL, `Failed to resolve import "./buildHeaders.js"`.

- [ ] **Step 3: Implementare**

`src/utils/buildHeaders.js`:

```js
const FORM_ENDPOINT = 'https://api.web3forms.com';

/**
 * Costruisce il contenuto di _headers dalle origini R2 dichiarate in
 * wrangler.json. Sorgente unica: chi compila wrangler.json a mano
 * seguendo il runbook ottiene la stessa CSP di chi usa Terraform.
 *
 * @param {object} config - oggetto wrangler.json
 * @returns {string} contenuto del file _headers
 */
export function buildHeaders(config) {
  const prod = config?.vars?.R2_PUBLIC_URL;
  const staging = config?.env?.staging?.vars?.R2_PUBLIC_URL;

  if (!prod) {
    throw new Error('wrangler.json: vars.R2_PUBLIC_URL mancante, impossibile generare la CSP.');
  }

  const origini = [...new Set([prod, staging].filter(Boolean))];

  const segnaposto = origini.filter(o => /pub-(x+|y+)\.r2\.dev/.test(o));
  if (segnaposto.length > 0) {
    throw new Error(
      `wrangler.json contiene ancora un segnaposto (${segnaposto.join(', ')}). ` +
      'Compila i valori reali, o generalo con `npm run infra:sync`.',
    );
  }

  const lista = origini.join(' ');

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    `img-src 'self' data: ${lista}`,
    `connect-src 'self' ${lista} ${FORM_ENDPOINT}`,
    `form-action 'self' ${FORM_ENDPOINT}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

  return [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '  X-Frame-Options: DENY',
    '  X-XSS-Protection: 0',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: geolocation=(), microphone=(), camera=()',
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx vitest run src/utils/buildHeaders.test.js`
Atteso: 6 test PASS.

- [ ] **Step 5: Collegare il plugin Vite**

In `vite.config.js`, aggiungere l'import e il plugin, e registrarlo nell'array `plugins` accanto a `siteMetaPlugin()`:

```js
import { readFileSync, existsSync } from 'fs'
import { buildHeaders } from './src/utils/buildHeaders.js'

// Genera dist/_headers dalle origini R2 di wrangler.json, invece di tenere
// il file statico allineato a mano (audit di luglio, punto 2).
const headersPlugin = () => ({
  name: 'generate-headers',
  apply: 'build',
  generateBundle() {
    if (!existsSync('wrangler.json')) {
      this.error('wrangler.json non trovato. Crealo con `cp wrangler.example.json wrangler.json` e compilalo, oppure genera tutto con `npm run infra:sync`.')
    }
    this.emitFile({
      type: 'asset',
      fileName: '_headers',
      source: buildHeaders(JSON.parse(readFileSync('wrangler.json', 'utf8'))),
    })
  },
})
```

- [ ] **Step 6: Cancellare il file statico**

```bash
git rm public/_headers
```

Va dichiarato: `public/_headers` viene rimosso perché da ora è generato in `dist/_headers` dal plugin. Tenerlo significherebbe avere due sorgenti della stessa policy, e Vite copierebbe quella stale sopra quella generata.

- [ ] **Step 7: Verificare la build completa**

```bash
npm test
npm run build
cat dist/_headers | head -3
```

Atteso: tutti i test passano (264 preesistenti + 11 nuovi = **275**); `dist/_headers` esiste e la riga CSP contiene gli URL R2 di `wrangler.json`, non segnaposto.

- [ ] **Step 8: Verificare che il fallimento sia parlante**

```bash
mv wrangler.json /tmp/w.bak && npm run build 2>&1 | tail -3; mv /tmp/w.bak wrangler.json
```

Atteso: la build fallisce citando `cp wrangler.example.json wrangler.json`. Non deve produrre un `dist/` senza `_headers`, che sarebbe un sito senza alcuna intestazione di sicurezza.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(build): genera _headers dalle origini R2 di wrangler.json

Chiude il punto 2 dell'audit di luglio: la CSP non e piu scolpita in
public/_headers con dentro URL R2 di qualcun altro. La sorgente e
wrangler.json, non Terraform, cosi la CSP resta corretta anche per chi
ha configurato a mano seguendo il runbook.

La build fallisce, invece di proseguire, se wrangler.json manca o
contiene ancora segnaposto: un dist/ senza _headers sarebbe un sito
senza alcuna intestazione di sicurezza, e il guasto si noterebbe solo
in produzione.

Rimosso public/_headers: era la seconda sorgente della stessa policy e
Vite lo avrebbe copiato sopra quello generato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Runbook Cloudflare

Il percorso manuale, che la spec ha deciso di tenere come alternativa supportata (§3.4). Non è un ripiego: va mantenuto allineato al `.tf`, e si scrive rileggendolo.

**Files:**
- Create: `docs/runbook-cloudflare.md`
- Modify: `README.md` (rimando al runbook)

**Interfaces:**
- Consumes: le risorse dei Task 2–4 e il contratto di output del Task 4
- Produces: documentazione; nessun codice

- [ ] **Step 1: Scrivere il runbook**

`docs/runbook-cloudflare.md` deve coprire, in quest'ordine:

1. **Prerequisiti** — account Cloudflare; per il dominio custom, una zona attiva.
2. **Token API** — quali permessi servono (`Workers R2 Storage:Edit`, `Access: Apps and Policies:Edit`, `Turnstile:Edit`, `Zone:DNS:Edit` solo col dominio custom), e che si esporta come `CLOUDFLARE_API_TOKEN` senza finire in nessun file.
3. **Percorso Terraform** — `cp terraform.tfvars.example terraform.tfvars`, compilare, `terraform init`, `terraform apply`, poi `terraform -chdir=infra output -json > infra/outputs.json && npm run infra:sync`.
4. **L'ordine ha un vincolo**: `staging_hostname` non si conosce prima del primo deploy. Al primo giro si applicano i soli bucket con `terraform apply -target=cloudflare_r2_bucket.prod -target=cloudflare_r2_bucket.staging`, si fa il primo deploy, si legge l'hostname `workers.dev` dalla dashboard, lo si mette nel tfvars e si rilancia `terraform apply` completo.
5. **Percorso manuale** — le stesse risorse create dalla dashboard, con i passi già vissuti e verificati in [2026-07-12-prod-deploy-access.md](superpowers/plans/2026-07-12-prod-deploy-access.md): applicazione Access self-hosted, due public hostname per la produzione (`/admin` e `/api/admin`), policy Allow con le email, identity provider One-time PIN, e da dove si copia l'AUD. Poi `cp wrangler.example.json wrangler.json` e compilazione a mano.
6. **Git integration** — collegare il repo da Workers & Pages, branch `main` → Worker di produzione, branch `staging` → Worker di staging, build command `npm test && npm run build`. **Non gestibile da Terraform**: è configurazione della dashboard.
7. **Infrastruttura preesistente** — chi ha già creato le risorse a mano (come il sito di Davide) non deve ricrearle: `terraform import` per bucket e applicazioni Access, con il comando per ciascuna risorsa. In alternativa si resta sul percorso manuale, senza Terraform.
8. **Dominio custom per le foto** — perché conviene (r2.dev è rate-limited, senza cache né WAF), e come si attiva valorizzando `custom_photo_domain` e `photo_domain_zone_id`.

- [ ] **Step 2: Collegare il runbook dal README**

Aggiungere in `README.md`, subito dopo la sezione sul fork:

```markdown
## Infrastruttura

L'infrastruttura Cloudflare — bucket R2, domini pubblici, applicazioni Access — è
descritta in [`infra/`](infra/) con Terraform. Da lì si genera `wrangler.json`:

```bash
export CLOUDFLARE_API_TOKEN=...        # mai scriverlo in un file
cd infra && cp terraform.tfvars.example terraform.tfvars   # poi compila
terraform init && terraform apply
terraform -chdir=infra output -json > infra/outputs.json
npm run infra:sync
```

Preferisci configurare a mano dalla dashboard? Va bene: segui il
[runbook](docs/runbook-cloudflare.md), che porta allo stesso risultato. In
entrambi i casi la CSP si genera da `wrangler.json` durante la build.
```

- [ ] **Step 3: Verificare che i comandi citati esistano**

```bash
grep -o 'npm run [a-z:-]*' README.md docs/runbook-cloudflare.md | sort -u
node -e "const s=require('./package.json').scripts; for(const n of ['infra:sync','build','test']) if(!s[n]) throw new Error('manca lo script '+n); console.log('tutti gli script citati esistono')"
```

Atteso: `tutti gli script citati esistono`.

- [ ] **Step 4: Commit**

```bash
git add docs/runbook-cloudflare.md README.md
git commit -F - <<'EOF'
docs: runbook Cloudflare, percorso manuale equivalente al Terraform

La spec ha deciso di tenere il percorso manuale come alternativa
supportata, non come ripiego: qui e documentato passo per passo,
inclusi il vincolo d'ordine su staging_hostname (non si conosce prima
del primo deploy), la Git integration che Terraform non gestisce, e
terraform import per chi ha gia creato le risorse a mano.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8 [UMANO]: Applicare l'infrastruttura per davvero

I task precedenti scrivono e validano la configurazione, ma **nessuno ha mai eseguito `terraform apply`**: crea risorse vere su un account vero e richiede un token che questa VPS non deve possedere.

- [ ] **Step 1: Creare il token API Cloudflare** con i permessi elencati nel runbook, ed esportarlo nel proprio terminale.

- [ ] **Step 2: Eseguire `terraform plan`** e leggerlo per intero. Attenzione particolare: se il piano propone di **creare** bucket o applicazioni Access che già esistono, servono gli `import` del runbook, altrimenti si finisce con risorse duplicate e un sito che punta a quella sbagliata.

- [ ] **Step 3: Eseguire `terraform apply`**, generare gli output e rigenerare `wrangler.json` con `npm run infra:sync`.

- [ ] **Step 4: Verificare l'idempotenza.** Rilanciare `terraform plan`: atteso `No changes`. Se il piano propone modifiche su `cloudflare_zero_trust_access_application` senza che nulla sia cambiato, è il difetto di non idempotenza noto del provider: annotarlo e valutare se alzare o abbassare la versione pinnata.

- [ ] **Step 5: Verificare il deploy.** Dopo il push, controllare sull'URL `workers.dev` che `/api/data/site` risponda `200` e che `curl -sI` mostri l'header `content-security-policy` con gli URL R2 giusti.

Aggiungere l'esito a [docs/azioni-manuali.md](../../azioni-manuali.md).

---

## Self-Review

**Copertura della spec.** §3.1 (risorse gestibili) → Task 2 e 3. §3.2 (chi possiede il Worker) → vincolo globale, `cloudflare_workers_script` mai dichiarato. §3.3 (stato locale) → Task 1 Step 4. §3.4 (Terraform principale, runbook alternativa) → Task 7. §3.5 (r2.dev non va in produzione) → variabile `custom_photo_domain` nel Task 2 e punto 8 del runbook. Audit punto 2 (CSP) → Task 6. Audit punto 3 (`wrangler.json` parametrico) → Task 5. Audit punto 4 (runbook) → Task 7.

**Segnaposto.** Nessun TBD. L'unico contenuto non scritto per esteso è il corpo del runbook (Task 7 Step 1), dato come scaletta in otto punti con le fonti da cui ricavarli: è prosa da scrivere rileggendo il `.tf`, e anticiparla qui significherebbe scriverla due volte e farla divergere.

**Coerenza dei nomi.** Le otto chiavi di output del Task 4 sono esattamente quelle consumate da `renderWrangler` nel Task 5. La revisione aveva trovato qui un buco reale — `access_team_domain` era consumato ma non prodotto — corretto aggiungendolo sia come variabile (Task 2) sia come output che vi rimanda (Task 4). Branch `punto1-terraform` in tutti i task. `buildHeaders` e `renderWrangler` usati con la stessa grafia ovunque.

**Un rischio dichiarato.** I nomi dei campi HCL dei Task 2, 3 e 4 sono scritti secondo lo schema v5 più recente noto, ma **non sono stati verificati contro il provider**, che non è installato su questa macchina. Per questo il Task 1 Step 6 estrae lo schema reale e i task successivi dicono esplicitamente di allineare i nomi prima di scrivere. Se `terraform validate` fallisce, non è un imprevisto: è il punto in cui il piano si aspetta la correzione.
