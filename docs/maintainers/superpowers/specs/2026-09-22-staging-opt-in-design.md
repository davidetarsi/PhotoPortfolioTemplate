# Staging opt-in — Design

**Data**: 2026-09-22
**Stato**: approvato in brainstorming, da rivedere
**Origine**: il template garantisce due ambienti a chiunque lo adotti. Il costo lo paga
ogni persona che lo installa, nel setup; il beneficio serve in un momento solo,
l'aggiornamento. La domanda era se sia sproporzionato — e lo è.

## Obiettivo

Un setup che si legge lineare, su un ambiente solo, con il secondo ambiente disponibile
per chi lo vuole, acceso da un flag e spiegato in un documento suo. Chi non lo accende
non deve incontrarlo mai; chi lo accende deve trovare una lettura unica invece di
condizionali sparsi in cinque documenti.

---

## 1. Il punto di partenza, verificato

Verificato sul codice il 2026-09-22:

| Cosa | Stato |
|---|---|
| Risorse Terraform di staging | tre: `cloudflare_r2_bucket.staging`, `cloudflare_r2_managed_domain.staging`, `cloudflare_zero_trust_access_application.staging` |
| Output di staging | tre: `bucket_staging`, `r2_public_url_staging`, `access_aud_staging` |
| `enable_staging` | **non esiste** |
| `staging_hostname` | esiste, usato dall'Access app e (via `compact`) da Turnstile |
| `renderWrangler` | pretende le tre chiavi di staging come obbligatorie; scrive sempre `env.staging` |
| Runbook | staging compare nel riferimento variabili, nella sezione 4 intera, nel percorso manuale, nella git integration, negli import e nel riepilogo |
| README EN/IT | staging citato nel passo 5 del setup |
| `docs/upgrading.md` | **dà staging per scontato**: «il template distribuisce due ambienti proprio perché questo passo non ti costi nulla» |

Tre fatti verificati che vincolano il design:

1. **In locale il Worker non è testabile.** `npm run dev` è Vite puro e non serve le rotte
   `/api/*`. E `/admin` è irraggiungibile anche sotto `wrangler dev`, perché la verifica è
   fail-closed su un header che inserisce Cloudflare Access davanti a un Worker deployato
   (`src/worker/access-jwt.js:63-64`). Senza un ambiente deployato, **la prima prova di una
   modifica al Worker è la produzione**.
2. **Il bucket di staging nasce vuoto.** Contenuti e codice sono separati e non esiste
   copia prod → staging. Un ambiente di staging appena creato mostra un sito senza album.
3. **Turnstile non va toccato.** `domains = compact([var.prod_hostname, var.staging_hostname])`
   scarta già da solo un hostname vuoto (`infra/turnstile.tf:9`).

I fatti 1 e 2 insieme dicono cos'è davvero staging: verifica **che l'aggiornamento si
costruisca, si deployi e che l'admin ti faccia entrare**, non che il sito sia ancora
bello. È una rete parziale, e farla pagare a tutti nel setup è sproporzionato.

## 2. Decisioni

Prese in brainstorming, vincolano il resto:

1. **`enable_staging` con default `false`.** Chi adotta il template parte da un ambiente.
2. **Staging esce dal percorso principale** e vive in `docs/staging.md`. Scartata
   l'alternativa di condizionare i documenti esistenti: se lo scopo è alleggerire,
   riempire cinque documenti di «se hai staging…» sposta il peso invece di toglierlo.
3. **Niente flusso bozza/pubblica per i contenuti.** Sarebbe la risposta a un problema
   diverso: che modificare la bio sia immediato non è un difetto curabile con un secondo
   ambiente. Se un giorno quel rischio conterà, la leva è sui contenuti — versioni su R2,
   o un annulla.
4. **Niente copia prod → staging.** Il bucket vuoto si dichiara come limite. Una ricetta di
   copia richiederebbe istruzioni su credenziali R2 e uno script che oggi non esiste.
5. **Lo smoke test resta a `enable_staging = true`**, così il ciclo verificato continua a
   coprire anche il percorso a due ambienti.

## 3. Design

### 3.1 Il flag Terraform

Nuova variabile in `infra/variables.tf`:

```hcl
variable "enable_staging" {
  type        = bool
  default     = false
  description = "Create the second environment (bucket, managed domain, Access application)."
}
```

`count = var.enable_staging ? 1 : 0` sulle tre risorse di staging, sul modello già in uso
in `turnstile.tf`. I tre output diventano condizionali con la stessa forma di
`turnstile_sitekey`:

```hcl
output "bucket_staging" {
  value = var.enable_staging ? cloudflare_r2_bucket.staging[0].name : ""
}
```

`staging_hostname` resta, e la sua descrizione va aggiornata: serve solo quando
`enable_staging` è vero. Turnstile non si tocca.

### 3.2 Il generatore di `wrangler.json`

`src/utils/renderWrangler.js` oggi ha le tre chiavi di staging in `CHIAVI_RICHIESTE` e
scrive sempre il blocco. Diventa:

- le tre chiavi escono da `CHIAVI_RICHIESTE`;
- se **tutte e tre** sono presenti e non vuote, il blocco `env.staging` si compila come
  oggi;
- altrimenti `out.env.staging` viene **rimosso**, e se `out.env` resta senza chiavi viene
  rimosso anche lui — meglio nessun blocco che un blocco di stringhe vuote, che
  assomiglierebbe a una configurazione valida;
- presenza parziale (una o due chiavi su tre) è un errore esplicito, non un blocco a metà.

### 3.3 `docs/staging.md`

Otto sezioni, nell'ordine in cui si incontrano:

1. **Cos'è e cosa non è** — separa il codice, non i contenuti; due dashboard, due insiemi
   di contenuti, nessun ponte
2. **Ti serve davvero?** — cosa intercetta che una build locale non intercetta, col fatto 1
   della sezione 1 come motivazione; e cosa non intercetta
3. **Il bucket nasce vuoto** — il limite, dichiarato prima che qualcuno ci sbatta
4. **Accenderlo con Terraform** — `enable_staging = true`, i due passaggi imposti
   dall'hostname, `infra:sync`
5. **Accenderlo a mano** — dalla dashboard, per chi non usa Terraform
6. **Accenderlo dopo, a sito già vivo** — additivo, produzione intoccata; e
   **l'hostname di staging va aggiunto al widget Turnstile**, altrimenti il form su
   staging risponde `CHALLENGE_FAILED` a ogni invio
7. **Il giro di aggiornamento con staging** — allinea staging a main *prima* di tirare,
   risolvi una volta sola, promuovi in fast-forward
8. **Spegnerlo** — con l'avvertenza della sezione 5 qui sotto

### 3.4 Cosa esce dai documenti esistenti

| Documento | Cosa cambia |
|---|---|
| `docs/runbook-cloudflare.md` | staging esce da riferimento variabili, percorso manuale, git integration, import; la **sezione 4 intera** (uovo e gallina dell'hostname) trasloca in `staging.md`; il riepilogo finale perde i passi di staging |
| `README.md` / `README.it.md` | il passo 5 del setup non nomina più il branch staging; una riga dice che un secondo ambiente esiste, è spento di default, e rimanda a `docs/staging.md` |
| `docs/upgrading.md` | il percorso a un ambiente diventa quello normale; il giro su staging diventa un rimando a `staging.md` |
| `infra/terraform.tfvars.example` | `enable_staging = false` con il commento che spiega quando accenderlo |

### 3.5 Un testo che trasloca senza essere riscritto

La sezione 6 del runbook (git integration) dice di creare l'applicazione da
*Workers & Pages → Create application → **Pages***, e parla di un campo "Staging branch".
Mescola Pages e Workers e non corrisponde a come si configura Workers Builds oggi — ma il
setup reale funziona, quindi qualcosa di giusto contiene.

**Quel testo si sposta alla lettera**, con una nota che ne chiede la verifica sulla
dashboard. Non si riscrive a intuito: sarebbe inventare una procedura che nessuno ha
provato, esattamente il difetto che questo lavoro serve a togliere.

## 4. Cosa questo lavoro non fa

- non copia contenuti tra ambienti;
- non introduce bozze o pubblicazione;
- non cambia la configurazione del sito di Davide, che resta a due ambienti con
  `enable_staging = true`;
- non tocca Turnstile.

## 5. Rischi

**Il rischio serio: chi ha già staging e tira questo aggiornamento.** Il suo
`terraform.tfvars` non conterrà `enable_staging`, che quindi varrà `false`, e il primo
`terraform plan` proporrà di **distruggere** bucket di staging, dominio gestito e
applicazione Access. Un bucket di staging può contenere foto.

Mitigazione, su tre livelli:

1. `docs/upgrading.md` ha già una sezione «quando un aggiornamento cambia comportamento»:
   questo è il primo caso reale e va scritto lì, con l'azione richiesta esplicita
   (`enable_staging = true` nei propri tfvars **prima** di applicare);
2. la stessa avvertenza apre `docs/staging.md`;
3. il commento in `terraform.tfvars.example` dice che chi ha già un ambiente di staging
   deve metterlo a `true`.

Resta un rischio residuo per chi applica senza leggere il piano. Non è eliminabile da qui:
`terraform plan` mostra le distruzioni, ed è l'unico punto in cui una persona può fermarsi.

**Rischio minore:** con il default a `false`, il percorso a due ambienti viene esercitato
solo dallo smoke test e dal sito di Davide. È la ragione per cui la decisione 5 lo tiene a
`true`.

## 6. Verifica

- `renderWrangler`: test nelle due direzioni — tre chiavi presenti → blocco completo; tre
  assenti → nessun blocco `env`; presenza parziale → errore.
- `terraform validate` con `enable_staging` a `false` e a `true`.
- Smoke test della sezione 3.5 invariato: continua a creare otto risorse.
- Le ancore interne dei documenti che si linkano a vicenda risolvono.
- `ALLOW_PLACEHOLDER_CSP=1 npm run build` passa con un `wrangler.json` senza `env`.

## 7. Origine

Successore del percorso rimandato da
[F0](2026-09-20-f0-cold-install-audit-design.md) §2, decisione 2, dove l'audit del cammino
con account Cloudflare era stato esplicitamente differito a quando esistesse
un'infrastruttura vera da percorrere. Ora esiste, ed è stata verificata contro l'API reale il 22/09/2026.
