# Decisioni aperte

Scelte in attesa del maintainer. Quando una viene decisa, spostala in fondo con la data e l'esito.

## Semplificazione dell'installazione e dell'architettura (proposte del 2026-09-26)

Obiettivo: da 8 passi a circa 4 (fork → `npm run setup` → collega Git su Cloudflare → apri `/admin`).

| # | Proposta | Cosa elimina | Impegno | Da decidere |
|---|---|---|---|---|
| A | Niente `migrate`: la dashboard tratta l'assenza di `albums.json` come lista vuota e il primo salvataggio crea i file | passo 6: token API R2, `.env`, `npm run migrate`, l'errore "non rilanciare migrate" | piccolo | sì/no |
| C | Non tracciare più `wrangler.json` nel template (solo `wrangler.example.json`); il fork aggiunge il suo | conflitti a ogni merge, trappola del fast-forward, `git checkout --ours` | piccolo-medio | sì/no; serve sapere se il template stesso viene deployato dal repo |
| E | Font in un posto solo: un plugin Vite inserisce il link a Google Fonts da `theme/` | le modifiche coordinate su 4 HTML e sulle pagine custom | piccolo | sì/no |
| T | Template HTML sicuri per costruzione: helper interno `html\`…\`` che fa l'escaping di ogni valore, usato in admin e componenti | la classe di errori di S1 (HTML iniettato) | piccolo-medio | sì/no |
| D | `npm run setup`: `terraform apply`, legge gli output, scrive `wrangler.json`, imposta `TURNSTILE_SECRET` | unisce i passi 1 e 5; niente `outputs.json` a mano | medio, da provare su Cloudflare | sì/no |
| L | Testi di default in inglese, italiano come preset | mix di lingue per chi non è italiano | medio | opzionale |

Ordine proposto: A, C, E, T, D.

Valutate e non consigliate per ora: foto servite dal Worker invece che da un bucket pubblico (limite di 100.000 richieste al giorno del piano gratuito); procedura guidata via API di Cloudflare al posto di Terraform (molto codice da mantenere).

## Da verificare su un account Cloudflare reale

- **S4+U7** (branch `feat/s4-u7-domain`), prima del merge: il deploy collega il dominio da `wrangler.json`; `workers.dev` si spegne senza staging; lo staging non viene toccato; Workers Builds ha i permessi per creare il custom domain.
- **Dominio obbligatorio per `/admin`**: confermare che Access non protegge `/admin` da solo su `*.workers.dev`.

## Piccole cose

- Aggiungere "Account GitHub o GitLab" alla tabella dei requisiti del README (oggi è sottinteso).
