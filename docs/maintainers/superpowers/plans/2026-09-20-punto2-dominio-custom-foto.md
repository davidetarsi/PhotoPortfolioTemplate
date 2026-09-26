# Punto 2 — Dominio custom per le foto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servire le foto da un dominio proprio invece che da `r2.dev`, che Cloudflare dichiara rate-limited e senza cache, e togliere dal codice l'ultimo punto in cui il dominio delle foto è scolpito a mano.

**Architecture:** Il grosso è già in piedi dal punto 1: la risorsa `cloudflare_r2_custom_domain` esiste, gli output preferiscono il dominio custom quando c'è, e CSP e URL a runtime si generano da `R2_PUBLIC_URL`. Resta un solo accoppiamento: `siteConfig.heroImageUrl` è un URL assoluto, usato per il meta Open Graph e per l'hero in modalità degradata. Va trasformato in un riferimento `{album, name}`, come già fa il dato a runtime, così che nessun dominio resti scritto nella configurazione.

**Tech Stack:** Terraform (provider `cloudflare/cloudflare` 5.13.0), Node 20+, Vite 8, vitest.

**Spec:** [analisi §3.5](../specs/2026-09-20-template-distribuibile-analisi.md) e la decisione §8 punto 3.

## Global Constraints

Dal `CLAUDE.md` di `/srv/claude/workspaces/`:

- **Mai `git push --force`**, mai cancellare rami remoti, mai `--no-verify`. Push bloccato → fermarsi e segnalare.
- **Mai committare su `main`.** Branch dedicato e PR; il merge lo decide una persona.
- Si lavora solo dentro `/srv/claude/workspaces/`. Ogni file cancellato va dichiarato, con il motivo.
- **Non leggere, copiare o stampare credenziali.**
- Identità commit `VPS Agent <agent@vps-agent.invalid>`, già globale.

Ogni commit termina con:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Vincoli tecnici:

- **Mai `terraform apply` né `terraform plan`** da un agente: richiedono credenziali e toccano risorse vere. Solo `validate` e `fmt`.
- Branch di lavoro: `punto2-dominio-custom`, creato da `main` **dopo** che la PR del punto 1 è stata mergiata. Se `main` non contiene ancora `infra/`, fermarsi e segnalare.
- Il numero di test di partenza è **276**.

## Dipendenza da un'azione umana

I Task 1–3 sono codice e documentazione: si possono fare adesso.

Il Task 4 richiede `terraform apply`, che a sua volta richiede il **Task 8 del piano del punto 1** — mai eseguito. Finché quell'apply non avviene, il dominio custom non esiste e il punto 2 non è verificabile nella realtà. È registrato in [azioni-manuali](../../azioni-manuali.md).

## Stato di partenza verificato

Verificato sul codice il 2026-09-20:

| Cosa | Come si costruisce | Cambia col dominio? |
|---|---|---|
| Foto della griglia e lightbox | `photoUrl(r2PublicUrl, slug, name)` | ✅ da sola |
| Cover degli album | `photoUrl(r2PublicUrl, a.slug, a.coverName)` | ✅ da sola |
| Hero, dato a runtime | `photoUrl(r2PublicUrl, s.hero.album, s.hero.name)` | ✅ da sola |
| CSP in `dist/_headers` | `buildHeaders()` da `wrangler.json` | ✅ da sola |
| **Hero in modalità degradata** | `buildConfig.heroImageUrl`, URL assoluto | ❌ resta su `r2.dev` |
| **Meta `og:image`** | `injectSiteMeta` da `siteConfig.heroImageUrl` | ❌ resta su `r2.dev` |

Gli ultimi due sono il lavoro di questo punto. Il secondo conta più di quanto sembri: `og:image` è l'URL che i crawler dei social chiamano quando qualcuno condivide il sito, quindi è proprio il traffico che non vuoi mandare su un endpoint rate-limited.

Il primo produce anche un guasto visibile: quando la fetch dei dati fallisce, il sito degrada all'hero di build. Con la CSP che autorizza solo il dominio custom, quell'immagine viene **bloccata dal browser** — modalità degradata che degrada una seconda volta.

`scripts/migrate.js` già ricava `{album, name}` da quell'URL con `parseHeroRef`, quindi la forma a riferimento gli è congeniale.

---

## File Structure

| File | Responsabilità |
|---|---|
| `config/site.config.js` | `heroImageUrl` (assoluto) → `heroImage: { album, name }` |
| `src/utils/resolveHeroUrl.js` | nuovo: funzione pura, `(heroImage, r2PublicUrl) → url \| null` |
| `src/utils/resolveHeroUrl.test.js` | nuovo |
| `src/utils/injectSiteMeta.js` | usa il riferimento e l'URL pubblico invece dell'assoluto |
| `src/pages/home-logic.js` | fallback hero dal riferimento |
| `vite.config.js` | passa `r2PublicUrl` da `wrangler.json` a `injectSiteMeta` |
| `scripts/migrate.js` | legge il riferimento diretto, niente più parsing di URL |
| `infra/variables.tf` | variabile per spegnere il dominio `r2.dev` dopo la migrazione |
| `infra/r2.tf` | `enabled` del managed domain pilotato dalla variabile |
| `docs/runbook-cloudflare.md` | sezione 8 ampliata con la procedura d'ordine |

---

### Task 1: Riferimento hero indipendente dal dominio

**Files:**
- Create: `src/utils/resolveHeroUrl.js`, `src/utils/resolveHeroUrl.test.js`
- Modify: `config/site.config.js`, `src/pages/home-logic.js`, `scripts/migrate.js`

**Interfaces:**
- Consumes: `photoUrl(r2PublicUrl, album, name)` da `src/providers/r2.js`
- Produces: `resolveHeroUrl(heroImage, r2PublicUrl) → string | null`, usata dal Task 2

- [ ] **Step 1: Creare il branch**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git checkout main && git pull --ff-only
test -d infra || { echo "STOP: main non contiene infra/, la PR del punto 1 non e mergiata"; exit 1; }
git checkout -b punto2-dominio-custom
```

- [ ] **Step 2: Scrivere il test che fallisce**

`src/utils/resolveHeroUrl.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveHeroUrl } from './resolveHeroUrl.js';

describe('resolveHeroUrl', () => {
  it('costruisce l URL dal riferimento e dal dominio corrente', () => {
    expect(resolveHeroUrl({ album: 'sport', name: 'foto.webp' }, 'https://img.mario.com'))
      .toBe('https://img.mario.com/sport/foto.webp');
  });

  it('segue il dominio: cambiando r2PublicUrl cambia l URL', () => {
    const ref = { album: 'sport', name: 'foto.webp' };
    expect(resolveHeroUrl(ref, 'https://pub-aaa.r2.dev'))
      .toBe('https://pub-aaa.r2.dev/sport/foto.webp');
  });

  it('restituisce null se il riferimento manca', () => {
    expect(resolveHeroUrl(null, 'https://img.mario.com')).toBeNull();
    expect(resolveHeroUrl(undefined, 'https://img.mario.com')).toBeNull();
  });

  it('restituisce null se il riferimento e incompleto', () => {
    expect(resolveHeroUrl({ album: 'sport' }, 'https://img.mario.com')).toBeNull();
    expect(resolveHeroUrl({ name: 'foto.webp' }, 'https://img.mario.com')).toBeNull();
  });

  it('restituisce null se manca il dominio', () => {
    expect(resolveHeroUrl({ album: 'sport', name: 'foto.webp' }, '')).toBeNull();
  });
});
```

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

Run: `npx vitest run src/utils/resolveHeroUrl.test.js`
Atteso: FAIL, `Failed to resolve import "./resolveHeroUrl.js"`.

- [ ] **Step 4: Implementare**

`src/utils/resolveHeroUrl.js`:

```js
import { photoUrl } from '../providers/r2.js';

/**
 * Costruisce l'URL dell'hero di build dal suo riferimento {album, name} e
 * dal dominio pubblico corrente. Tenere il riferimento invece di un URL
 * assoluto e' cio' che permette di cambiare dominio delle foto senza
 * toccare la configurazione.
 *
 * @param {{album?: string, name?: string} | null | undefined} heroImage
 * @param {string} r2PublicUrl - dominio pubblico, senza barra finale
 * @returns {string | null} URL completo, oppure null se non ricostruibile
 */
export function resolveHeroUrl(heroImage, r2PublicUrl) {
  if (!heroImage?.album || !heroImage?.name || !r2PublicUrl) return null;
  return photoUrl(r2PublicUrl, heroImage.album, heroImage.name);
}
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `npx vitest run src/utils/resolveHeroUrl.test.js`
Atteso: 5 test PASS.

- [ ] **Step 6: Cambiare la forma della configurazione**

In `config/site.config.js`, sostituire la riga di `heroImageUrl` con:

```js
  // Riferimento alla foto usata come hero, nella forma { album, name }.
  // Non un URL assoluto: cosi cambiare il dominio delle foto non richiede
  // di toccare questo file. Lascia null finche non hai caricato le foto.
  heroImage: null,  // es. { album: 'nome-album', name: 'nome-foto.webp' }
```

- [ ] **Step 7: Aggiornare il fallback della home**

In `src/pages/home-logic.js`, aggiungere l'import e sostituire la riga 19:

```js
import { resolveHeroUrl } from '../utils/resolveHeroUrl.js';
```

```js
    heroUrl: resolveHeroUrl(buildConfig.heroImage, buildConfig.r2PublicUrl),
```

- [ ] **Step 8: Semplificare `migrate.js`**

`parseHeroRef` esisteva solo per estrarre `{album, name}` da un URL assoluto. Ora il riferimento c'è già. In `scripts/migrate.js` sostituire:

```js
    hero: cfg.heroImage ?? null,
```

e **cancellare la funzione `parseHeroRef`** insieme ai suoi test in `scripts/migrate.test.js`. Va dichiarato nel commit: la funzione sparisce perché il dato che serviva a ricavare è ora dichiarato direttamente.

- [ ] **Step 9: Eseguire tutti i test**

Run: `npm test`
Atteso: passano tutti. Il totale cambia rispetto a 276: +5 da `resolveHeroUrl`, meno quelli di `parseHeroRef` che sono stati rimossi. **Riferire il numero esatto e quali test sono spariti**, non aggiustarlo.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -F - <<'EOF'
refactor: l'hero di build diventa un riferimento, non un URL assoluto

siteConfig.heroImageUrl conteneva il dominio delle foto scolpito nella
configurazione: era l'ultimo punto del codice che un cambio di dominio
avrebbe lasciato indietro, con due effetti concreti — il meta og:image
avrebbe continuato a mandare i crawler dei social su r2.dev, che e'
rate-limited, e l'hero in modalita degradata sarebbe stato bloccato
dalla CSP, che dopo il passaggio autorizza solo il dominio nuovo.

Ora e' heroImage: { album, name }, come gia' fa il dato a runtime, e
l'URL si costruisce dal dominio corrente.

Rimossa parseHeroRef da migrate.js e i suoi test: serviva solo a
ricavare {album, name} da un URL assoluto, e ora il riferimento e'
dichiarato direttamente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Meta Open Graph sul dominio corrente

`injectSiteMeta` gira a build time e oggi riceve solo `siteConfig`. Ora gli serve anche il dominio pubblico, che sta in `wrangler.json` — lo stesso file che il plugin della CSP già legge.

**Files:**
- Modify: `src/utils/injectSiteMeta.js`, `src/utils/injectSiteMeta.test.js`, `vite.config.js`

**Interfaces:**
- Consumes: `resolveHeroUrl` dal Task 1
- Produces: `injectSiteMeta(html, siteConfig, r2PublicUrl) → string` — firma a tre argomenti

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere in `src/utils/injectSiteMeta.test.js`:

```js
  it('costruisce og:image dal riferimento hero e dal dominio passato', () => {
    const html = '<meta property="og:image" content="{{SITE_IMAGE}}" />';
    const out = injectSiteMeta(
      html,
      { heroImage: { album: 'sport', name: 'foto.webp' } },
      'https://img.mario.com',
    );
    expect(out).toContain('https://img.mario.com/sport/foto.webp');
  });

  it('rimuove il meta og:image se non c e un riferimento hero', () => {
    const html = '<meta property="og:image" content="{{SITE_IMAGE}}" />';
    const out = injectSiteMeta(html, { heroImage: null }, 'https://img.mario.com');
    expect(out).not.toContain('og:image');
  });
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx vitest run src/utils/injectSiteMeta.test.js`
Atteso: FAIL — il primo test non trova l'URL, perché la funzione ignora il terzo argomento.

- [ ] **Step 3: Implementare**

In `src/utils/injectSiteMeta.js`, aggiungere l'import di `resolveHeroUrl`, cambiare la firma e la riga di `SITE_IMAGE`:

```js
export function injectSiteMeta(html, siteConfig, r2PublicUrl) {
```

```js
    SITE_IMAGE: resolveHeroUrl(siteConfig.heroImage, r2PublicUrl) ?? '',
```

Il meta con `content=""` viene già rimosso dalla regex in fondo alla funzione: il secondo test passa senza altre modifiche.

- [ ] **Step 4: Collegare il dominio nel plugin Vite**

In `vite.config.js`, il plugin `siteMetaPlugin` deve leggere `R2_PUBLIC_URL` da `wrangler.json`, come già fa `headersPlugin`. Leggerlo **una volta sola** in cima al file, riusando l'import di `readFileSync` già presente:

```js
// Letto una volta: serve sia al meta og:image sia alla CSP, e leggerlo due
// volte aprirebbe la porta a due valori diversi nello stesso build.
const wranglerConfig = existsSync('wrangler.json')
  ? JSON.parse(readFileSync('wrangler.json', 'utf8'))
  : null
const r2PublicUrl = wranglerConfig?.vars?.R2_PUBLIC_URL ?? ''
```

e passare `r2PublicUrl` come terzo argomento di `injectSiteMeta`. Il `headersPlugin` continua a leggere `wrangler.json` per conto proprio nel suo `generateBundle`, perché deve fallire lì con il messaggio giusto se il file manca.

- [ ] **Step 5: Eseguire i test e la build**

```bash
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build
grep -o 'og:image[^>]*' dist/index.html
```

Atteso: test tutti verdi; la build passa; il meta `og:image` o contiene un URL costruito dal dominio in `wrangler.json`, o è assente se `heroImage` è `null` (che è il caso del template, dove il seed è neutro).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(build): og:image costruito dal dominio corrente delle foto

injectSiteMeta riceve r2PublicUrl e ricostruisce l'URL dell'hero invece
di copiarlo dalla configurazione. og:image e' l'URL che i crawler dei
social chiamano quando qualcuno condivide il sito: e' proprio il
traffico che non ha senso mandare su un endpoint rate-limited.

wrangler.json viene letto una volta sola in cima a vite.config.js: era
gia' letto dal plugin della CSP, e leggerlo due volte aprirebbe la
porta a due valori diversi nello stesso build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Spegnere `r2.dev` dopo la migrazione, e documentarla

Il dominio gestito `r2.dev` resta acceso anche dopo che il custom è attivo. Lasciarlo non rompe nulla, ma tiene in vita una porta pubblica e rate-limited sullo stesso bucket, raggiungibile da chiunque conosca l'URL. Spegnerlo va però fatto **dopo** che il custom funziona, non insieme.

**Files:**
- Modify: `infra/variables.tf`, `infra/r2.tf`, `infra/terraform.tfvars.example`, `docs/runbook-cloudflare.md`

**Interfaces:**
- Consumes: `var.custom_photo_domain` del punto 1
- Produces: nessuna interfaccia di codice

- [ ] **Step 1: Aggiungere la variabile**

In `infra/variables.tf`:

```hcl
variable "keep_managed_domain" {
  type        = bool
  default     = true
  description = "Tiene acceso il dominio r2.dev di produzione. Va messo a false SOLO dopo aver verificato che il dominio custom serve le foto: spegnerlo prima lascia il sito senza immagini."
}
```

- [ ] **Step 2: Collegarla al managed domain di produzione**

In `infra/r2.tf`, nella risorsa `cloudflare_r2_managed_domain.prod`, sostituire `enabled = true` con:

```hcl
  # Resta acceso finche' non si e' verificato che il dominio custom serve
  # davvero le foto. Lo staging non ha un custom, quindi il suo resta sempre acceso.
  enabled = var.keep_managed_domain || var.custom_photo_domain == ""
```

Lo `staging` non va toccato: non ha un dominio custom, quindi il suo `r2.dev` è l'unica via ed è giusto resti acceso.

- [ ] **Step 3: Aggiornare l'esempio di tfvars**

In `infra/terraform.tfvars.example`, sotto le righe del dominio custom:

```hcl
# Dopo aver verificato che le foto arrivano dal dominio custom, metti false
# per chiudere la porta r2.dev sul bucket di produzione.
# keep_managed_domain = false
```

- [ ] **Step 4: Validare**

```bash
export PATH="$HOME/.local/bin:$PATH"
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
```

Atteso: `Success! The configuration is valid.`

- [ ] **Step 5: Ampliare la sezione 8 del runbook**

In `docs/runbook-cloudflare.md`, sezione *Dominio custom per le foto*, aggiungere la procedura nell'ordine corretto, spiegando che l'ordine non è arbitrario:

1. Il dominio (o sottodominio) deve stare su una zona Cloudflare dell'account.
2. Valorizzare `custom_photo_domain` e `photo_domain_zone_id`, lasciando `keep_managed_domain = true`.
3. `terraform apply`, poi `terraform -chdir=infra output -json > infra/outputs.json && npm run infra:sync`. `R2_PUBLIC_URL` passa al dominio custom, e da lì CSP e URL a runtime seguono da soli.
4. Attendere il DNS, poi verificare **prima di spegnere qualcosa**: `curl -sI https://img.iltuodominio.com/<album>/<foto>.webp` deve dare `200`.
5. Deployare e controllare che la riga CSP di `dist/_headers` contenga il dominio custom.
6. Solo ora `keep_managed_domain = false` e un altro `apply`.
7. Nota: gli URL `r2.dev` già condivisi smettono di funzionare da quel momento. Se ne hai diffusi, rimanda questo passo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -F - <<'EOF'
feat(infra): permetti di spegnere r2.dev dopo il passaggio al custom

Il dominio gestito resta acceso anche col custom attivo: non rompe
nulla, ma lascia aperta una porta pubblica e rate-limited sullo stesso
bucket. La variabile keep_managed_domain permette di chiuderla, con
default true perche' spegnerla prima di aver verificato il dominio
custom lascerebbe il sito senza foto.

Lo staging non e' toccato: non ha un custom, quindi il suo r2.dev e'
l'unica via.

Runbook: la procedura in sette passi, con la verifica curl prima di
spegnere e l'avvertenza che gli URL r2.dev gia' condivisi moriranno.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4 [UMANO]: Attivare il dominio e migrare

Richiede il `terraform apply` del punto 1, mai eseguito, e un dominio su una zona Cloudflare.

- [ ] **Step 1: Scegliere il sottodominio** per le foto, per esempio `img.iltuodominio.com`, e recuperare lo **Zone ID** della zona che lo contiene.

- [ ] **Step 2: Migrare il riferimento hero.** Il Task 1 cambia la forma di `config/site.config.js`. Nel tuo sito `heroImageUrl` conteneva un URL assoluto: va riscritto come `heroImage: { album: '<album>', name: '<nome-file>' }`, prendendo i due segmenti finali del vecchio URL. **Non rilanciare `npm run migrate` dopo**, o sovrascriveresti su R2 i contenuti reali col seed.

- [ ] **Step 3: Applicare**, seguendo i sette passi della sezione 8 del runbook, senza saltare la verifica `curl` del punto 4.

- [ ] **Step 4: Verificare i social.** Condividere l'URL del sito su una chat e controllare che l'anteprima mostri l'immagine, oppure usare un validatore di Open Graph. È il percorso che questo punto serviva a sistemare, ed è anche l'unico che non si vede navigando il sito.

- [ ] **Step 5: Chiudere `r2.dev`** con `keep_managed_domain = false`, solo dopo che i passi 3 e 4 sono andati.

Aggiungere l'esito a [docs/maintainers/azioni-manuali.md](../../azioni-manuali.md).

---

## Self-Review

**Copertura della spec.** §3.5 chiedeva il dominio custom per la produzione e di lasciare `r2.dev` come default nel template: il default resta (`custom_photo_domain` vuoto), e il custom si attiva per variabile. La decisione §8 punto 3 diceva «sul sito in produzione il custom si applica comunque»: è il Task 4.

**Segnaposto.** Nessun TBD. La sezione 8 del runbook è data come procedura in sette passi con il contenuto di ciascuno, non come titolo da riempire.

**Coerenza dei nomi.** `heroImage` (riferimento) sostituisce `heroImageUrl` (assoluto) in `config/site.config.js`, `home-logic.js`, `injectSiteMeta.js` e `migrate.js`: il Task 1 li cambia tutti e quattro nello stesso commit, quindi non esiste uno stato intermedio in cui una parte legge il vecchio nome. `resolveHeroUrl` ha la stessa firma nei Task 1 e 2.

**Un rischio dichiarato.** Il Task 1 Step 9 dice che il totale dei test cambierà rispetto a 276 e chiede di riferire il numero invece di aggiustarlo: rimuovere `parseHeroRef` ne toglie alcuni e `resolveHeroUrl` ne aggiunge cinque. Un agente che trovasse il conto diverso dall'atteso potrebbe essere tentato di "sistemarlo", ed è esattamente ciò che non deve fare.

**Una cosa che questo piano non fa.** Non tocca i dati già su R2, e non serve: `_site/site.json` e `_data/albums.json` contengono riferimenti `{album, name}` e `coverName`, non URL assoluti. Il cambio di dominio li segue senza migrazione. È stato verificato leggendo `home-logic.js` e `r2.js`, non dato per scontato.
