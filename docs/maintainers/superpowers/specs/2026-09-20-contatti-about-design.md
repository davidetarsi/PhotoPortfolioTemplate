# Pagina contatti e about — Design

**Data**: 2026-09-20
**Stato**: da rivedere
**Origine**: la pagina contatti è anonima e si appoggia a Web3Forms, un servizio esterno che la documentazione non spiegava. Decisione di fondere contatti e about, e di portare il form dentro il Worker.

## Obiettivo

Una pagina sola che dice chi sei e permette di scriverti, con i messaggi che restano nel sistema invece di disperdersi in una casella di posta, e senza che chi clona debba creare un account su un servizio terzo.

---

## 1. Il punto di partenza, verificato

Verificato sul codice il 2026-09-20:

| Cosa | Stato |
|---|---|
| Layout del form | **nostro**: `ContactForm.js` (57 righe), `contact-form.css` (50), `contatti.html` (29) |
| Web3Forms | solo un URL: `api.web3forms.com/submit` |
| Campi | `name`, `email`, `message`, più `botcheck` (honeypot) |
| Documentazione | due righe nel README. **Manca il passo *Allowed Domains***, che c'era prima della riscrittura del punto 3 |
| Pagina about | non esiste |
| Prefissi riservati su R2 | `_site/`, `_data/`, `_config/` già in uso |
| `RESERVED_SLUGS` | `['admin', 'api', 'assets', 'contatti']` |

Il passo *Allowed Domains* mancante è un difetto indipendente: senza quello, il form di chi clona fallisce in silenzio. Questo design lo supera rimuovendo del tutto Web3Forms.

---

## 2. Decisioni prese

| # | Decisione | Esito |
|---|---|---|
| 1 | Dove finiscono i messaggi | **Su R2**, letti dalla dashboard |
| 2 | Web3Forms | **Rimosso del tutto**, un solo percorso |
| 3 | Notifica | **Webhook configurabile**, nessun fornitore scelto dal template |
| 4 | Contatti e about | **Una pagina sola** |
| 5 | Testo e ritratto | **Contenuto su R2**, modificabili dalla dashboard |
| 6 | Il ritratto | **Caricabile direttamente**, non deve stare in un album |
| 7 | Campi del form | `name`, `email`, `message` obbligatori, `subject` facoltativo |

---

## 3. Architettura

```
browser                 Worker                      R2
  │                       │                          │
  │ POST /api/contact     │                          │
  ├──────────────────────►│ valida                   │
  │                       │ scrive ──────────────────►│ _messages/<data>-<id>.json
  │                       │                          │
  │                       │ POST webhook (se c'è) ───► ntfy / Telegram / …
  │◄──────────────────────┤ 200                      │
  │                       │                          │
                    /admin ──► GET /api/admin/messages ──► elenco
```

La rotta `/api/contact` è **pubblica**: non sta dietro Cloudflare Access, a differenza di `/admin` e `/api/admin/*`. È l'unica scrittura non autenticata del sistema, e da qui discendono i vincoli della §6.

### Forma del messaggio

```json
{
  "name": "Mario Rossi",
  "email": "mario@esempio.it",
  "subject": "Reportage matrimonio",
  "message": "Ciao, vorrei…",
  "receivedAt": 1789000000000
}
```

`subject` è assente se non compilato. **Non si registra l'indirizzo IP** né lo user agent: sono dati personali che non servono a rispondere a un messaggio, e non raccoglierli è più semplice che doverli giustificare.

### Nomi degli oggetti

`_messages/<ISO-8601>-<6 caratteri casuali>.json`, per esempio `_messages/2026-09-20T18-04-11Z-a7f3k2.json`.

Il prefisso ordinabile per data rende l'elenco della dashboard un `list` con `prefix`, senza indice da mantenere. Il suffisso casuale evita collisioni fra due invii nello stesso secondo.

---

## 4. La notifica

Dopo aver scritto su R2, il Worker fa `POST` a un URL preso da un **secret**, non da una `var`.

**La distinzione è vincolante**: `wrangler.json` è versionato, e un URL Telegram contiene il token del bot. Deve essere `wrangler secret put CONTACT_NOTIFY_URL`. Il runbook deve dirlo in modo che non si possa fraintendere, perché sbagliarlo significa pubblicare un token su GitHub.

Il template non sceglie un fornitore: qualunque servizio che accetti un POST va bene. Il runbook documenta tre ricette:

| Servizio | Cosa serve |
|---|---|
| [ntfy.sh](https://ntfy.sh/) | **niente**: un nome di topic e l'app sul telefono |
| Telegram | un bot creato con BotFather |
| Discord / Slack | un webhook URL |

`ntfy.sh` è la ricetta consigliata: è l'unica che non richiede alcun account.

### Il corpo della notifica non contiene il messaggio

Solo: *"Nuovo messaggio da Mario Rossi"*, più un collegamento alla dashboard.

Due ragioni, e la prima è di sicurezza: **i topic pubblici di ntfy sono leggibili da chiunque ne indovini il nome**. Mandare lì il testo di un messaggio privato sarebbe una fuga di dati. La seconda è che la notifica serve a dire *vai a guardare*, e il posto dove guardare è la dashboard.

### Il fallimento della notifica non fa fallire l'invio

Se il webhook non risponde, il messaggio è già salvato e l'utente riceve comunque conferma. L'errore si registra nei log del Worker. Il contrario — un visitatore che vede "invio fallito" perché il telefono del proprietario era irraggiungibile — sarebbe assurdo.

---

## 5. Il selettore di foto a due modi

Il ritratto non deve stare per forza in un album. Il selettore guadagna due modi:

- **Carica** una foto nuova, che finisce in `_site/` — fuori dagli album, quindi non compare nelle gallerie pubbliche.
- **Scegli** una foto già caricata, da un album o fra quelle in `_site/`.

Le foto caricate così restano elencate nel selettore, riusabili.

**Serve a due posti, non a uno.** Oggi anche la hero deve stare dentro un album, ed è lo stesso fastidio. Il selettore va costruito una volta e usato da entrambi: ritratto e hero. Costruirne due sarebbe il doppio del codice per lo stesso gesto.

Il riferimento resta la forma già in uso, `{ album, name }`, con `_site` al posto dello slug: `resolveHeroUrl` e `photoUrl` continuano a funzionare senza modifiche.

`_site` va aggiunto a `RESERVED_SLUGS`, perché nessuno possa creare un album che collida col prefisso.

---

## 6. Una rotta pubblica che scrive: le conseguenze

È l'unica del sistema, e va trattata di conseguenza.

- **Honeypot** — già presente, si mantiene.
- **Cloudflare Turnstile** — il CAPTCHA di Cloudflare: gratuito, nativo allo stack, nessun terzo in più. Attivabile da configurazione, **acceso di default** nella documentazione. Vedi §6.1 per la configurazione e §6.2 per l'infrastruttura.
- **Limiti di dimensione** — messaggio e campi hanno una lunghezza massima, verificata dal Worker prima di scrivere. Un corpo troppo grande viene respinto senza toccare R2.
- **Validazione condivisa** — `validateContactShape` in `src/shared/content-rules.js`, accanto alle altre, così le stesse regole valgono per Worker e dashboard.

Senza Turnstile il sistema resta usabile ma esposto: va detto esplicitamente a chi decide di non attivarlo, non lasciato capire.

### 6.1 Turnstile: si configura per sparire, non per somigliare al sito

Il widget vive in un iframe: colori, font e forma **non sono personalizzabili**. La via "CAPTCHA coerente con la grafica" non esiste. Quella che esiste è migliore: non mostrarlo.

Configurazione scelta: **modalità `managed`, `appearance: interaction-only`, `theme: auto`**.

Con `interaction-only` il widget **non compare affatto** per i visitatori legittimi: nessun riquadro, nessuna casella. Appare solo quando Cloudflare sospetta qualcosa.

Perché non la modalità `invisible`, che pure esiste: lì un utente vero segnalato per errore **non ha nulla da cliccare, e l'invio fallisce senza spiegazione**. Con `interaction-only` quasi nessuno vede qualcosa, e il caso raro ha una via d'uscita. Su un form di contatto ogni messaggio perso è una persona che non ti ha scritto, e non lo saprai mai.

`theme: auto` segue le preferenze del sistema: è l'unica leva estetica disponibile, e va usata.

**Non si costruisce una sfida artigianale.** Le sfide creative che si vedono in giro sono graziose e deboli: un bot non le risolve ragionando, le risolve una volta e poi le scripta. Sarebbero peggio di Turnstile su ogni fronte tranne l'estetica — e l'estetica qui si risolve non mostrando nulla.

### 6.2 Conseguenze sull'infrastruttura

Turnstile **si dichiara in Terraform**, quindi non aggiunge un passaggio manuale: entra nella catena che esiste già.

La risorsa è `cloudflare_turnstile_widget`, con account, nome, domini e modalità. Espone due valori, che vanno in due posti diversi:

| Valore | Dove va | Perché |
|---|---|---|
| **sitekey** | pubblica, in `wrangler.json` come `var` | finisce nell'HTML, non è un segreto |
| **secret** | `wrangler secret put TURNSTILE_SECRET` | serve al Worker per validare il token, **non deve finire in git** |

È la stessa distinzione dell'URL di notifica (§4), e vale la stessa avvertenza: `wrangler.json` è versionato.

Da aggiungere quindi a `infra/`: la risorsa, la variabile per accendere o spegnere Turnstile, e l'output della sitekey verso `renderWrangler`. Il runbook guadagna una sezione.

### Dati personali

I messaggi contengono nome ed email di persone reali, su un bucket che appartiene a chi installa il template. La dashboard deve permettere di **eliminarli**, e la documentazione deve dire che quei dati esistono e dove. Non è una funzione in più: è la condizione per poterli conservare.

---

## 7. La pagina

Una sola, sostituisce `contatti.html`. Dall'alto:

1. Presentazione — testo lungo, **contenuto su R2**
2. Ritratto — **contenuto su R2**, dal selettore della §5
3. Social — già esistenti in `site.json`
4. Riga di aspettativa, del tipo "ti rispondo entro due giorni" — **copy in `texts.config.js`**: non cambia mai, non è contenuto
5. Form — quattro campi, etichette e messaggi da `texts.config.js`

La distinzione fra 1–3 e 4–5 è quella di §4.2 dell'analisi, applicata alla lettera: ciò che cambia nel tempo sta su R2 e si modifica dalla dashboard, ciò che è interfaccia sta nei file.

### Campi

| Campo | Obbligatorio |
|---|---|
| `name` | sì |
| `email` | sì |
| `subject` | no |
| `message` | sì |

È un default deliberatamente neutro: non presume che chi installa faccia matrimoni o ritratti. Chi vuole un modulo da prenotazione lo avrà quando i campi diventeranno configurabili, che è fuori da questo design.

### Rotta

La pagina resta su `/contatti`, già in `RESERVED_SLUGS`. Il nome italiano in un template inglese è una stonatura nota, ma rinominarla tocca routing, navigazione, test e i link già condivisi: è una decisione separata, da prendere prima di distribuire.

---

## 8. Cosa resta fuori, e perché

**Campi configurabili.** Ora sappiamo dove finiscono i messaggi, ma la dashboard deve saperli mostrare. Conviene vederla funzionare con un set fisso prima di renderla generica: costruire il form dinamico e poi scoprire che la dashboard va ripensata significherebbe farlo due volte.

**Varianti di pagina** (about e contatti separate, oppure unite). Non è lo stesso meccanismo delle varianti di card: quelle sono solo CSS sullo stesso HTML, questa è struttura — routing, navigazione, entry point della build. Si può fare con una variabile che decide cosa si costruisce, ma è un progetto a sé. E soprattutto: **le tre varianti di card non le ha ancora guardate nessuno**. Costruire varianti di pagina prima di sapere se quelle di card servono significa impilare su terreno non verificato.

**Notifica via Cloudflare Email Service.** Richiede un dominio su DNS Cloudflare con record MX, SPF, DKIM e DMARC. Il template dichiara il dominio facoltativo, quindi non può essere la via principale. Resta una ricetta possibile nel runbook per chi ha già il dominio.

---

## 9. Migrazione

Per il sito esistente non c'è nulla da migrare: i messaggi vecchi restano nella casella di posta, quelli nuovi arrivano su R2. Cambia solo l'URL a cui il form invia.

Da rimuovere insieme a Web3Forms: la costante in `ContactForm.js`, `web3formsAccessKey` in `config/site.config.js`, `VITE_WEB3FORMS_ACCESS_KEY` in `.env.example`, e le menzioni nei due README.

---

## 10. Come si verifica

- **Funzioni pure** — validazione dei campi, costruzione dell'oggetto messaggio, nome dell'oggetto R2, corpo della notifica: tutte testabili senza rete né DOM, come il resto del progetto.
- **Rotte del Worker** — con il bucket finto già usato dai test esistenti (`makeFakeBucket`).
- **Il fallimento della notifica non blocca la risposta** — è un test a sé: è il comportamento più facile da rompere in una modifica futura.
- **Il messaggio non compare nel corpo della notifica** — anche questo un test: è una garanzia di sicurezza, e le garanzie non verificate scadono.

---

## 11. Domande ancora aperte

Non bloccano l'implementazione, ma vanno sciolte:

- **Stato "letto"** sui messaggi nella dashboard: utile, ma richiede una scrittura per ogni apertura. Si può rimandare.
- **Quanti messaggi mostra la dashboard** e se serve la paginazione. Dipende da quanti ne arrivano: si può partire senza.
- **Se e quando cancellare i messaggi vecchi** in automatico. Per ora la cancellazione è manuale, dalla dashboard.
