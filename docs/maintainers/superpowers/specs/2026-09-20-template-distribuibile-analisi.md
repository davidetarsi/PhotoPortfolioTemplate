# Da sito personale a template distribuibile — Analisi

**Data**: 2026-09-20
**Stato**: decisioni chiuse il 2026-09-20 (§8)
**Origine**: conversazione sulla direzione da dare al progetto — Terraform per l'infrastruttura, centralizzazione della personalizzazione, dashboard con anteprima. Obiettivo dichiarato: un template che amici sviluppatori-fotografi possano clonare da GitHub e usare subito.

Questo documento **non è un piano**. Serve a stabilire cosa esiste davvero, cosa manca, cosa è fattibile e a che prezzo, prima di decidere l'ordine dei lavori.

Prosegue [2026-07-12-boilerplate-template-audit.md](2026-07-12-boilerplate-template-audit.md), che resta valido nei suoi quattro punti.

---

## 1. Stato reale, verificato

Verificato sul branch `staging` di `your-github-user/your-portfolio` (33 commit avanti rispetto a `main`) il 2026-09-20.

| Capacità | Stato | Dove |
|---|---|---|
| Storage su R2 al posto di Google Drive | fatto | `src/providers/r2.js`, `src/providers/data.js` |
| Worker con API dati e API admin | fatto | `src/worker/data-routes.js`, `admin-routes.js` |
| Autenticazione via Cloudflare Access | fatto, prod + staging | `src/worker/access-jwt.js` |
| Dashboard: upload, ordinamento, cover, creazione album | fatto | `src/admin/` (16 moduli) |
| Compressione nel browser prima dell'upload | fatto | `src/admin/pipeline.js` — 1900px, WebP q85 |
| Compressione da CLI | fatto, coesiste | `scripts/compress.js` |
| Token di tema condivisi tra sito e dashboard | fatto | `src/styles/admin.css` importa `theme/tokens.css` |
| Stato "modifica poi salva" | **parziale** | sito (nome/bio/social) e album (descrizione/cover), con guardia `beforeunload` |
| Anteprima prima del salvataggio | **parziale** | overlay coi componenti veri del sito, ma solo dalla schermata "Sito" |
| Terraform | **assente** | nessun `.tf` in nessuno dei due repo |
| Stringhe dashboard in `texts.config.js` | **assente** | hardcoded in italiano nei JS |

Copertura test: 264 test (verificati con `npm test`; un conteggio precedente diceva 268, ma era una stima via `grep` che includeva 4 occorrenze di `makeJwtTestKit(`).

**Conseguenza**: tre delle quattro direzioni che volevi prendere sono già costruite. Quello che resta non è un progetto nuovo, è un lavoro di completamento e di confezionamento. Questo cambia molto la stima complessiva, in meglio.

### 1.1 Come sta davvero l'anteprima

> **Nota**: la prima stesura di questa sezione era **sbagliata**. Era stata dedotta da [2026-07-11-admin-preview-design.md](2026-07-11-admin-preview-design.md), che descrive lo scope di luglio e non lo stato attuale: il codice è andato avanti nei 33 commit di `staging`. Quanto segue è verificato sul codice il 2026-09-20.

Il design di luglio dichiarava fuori scope l'anteprima per gli album, e prevedeva lo stato "modifica poi salva" solo per i tre campi del form Sito. **Da allora il meccanismo è stato esteso**, e oggi la situazione è questa:

| Azione | Comportamento | Dove |
|---|---|---|
| Nome, bio, Instagram | in sospeso → "Salva sito" | `views/home.js` |
| Descrizione album, cover | in sospeso → "Salva" + guardia `beforeunload` | `views/album.js:93` |
| Scelta della hero | scrive subito | `views/home.js:92` |
| Caricamento foto | scrive subito | `views/album.js:158` |
| Eliminazione foto | scrive subito | `views/album.js:100` |
| Riordino per trascinamento | scrive subito | `views/album.js:193` |
| Ordina per data | scrive subito | `views/album.js:210` |

Lo stato "sporco" esiste già, con `markDirty`/`clearDirty` e avviso all'uscita, ed è coperto da test.

Anche l'overlay di anteprima è più ricco di quanto il design di luglio lasci pensare: non è un layout parallelo, ma **riusa i componenti veri del sito pubblico** — `Hero`, `Footer`, `AlbumCard`, `PhotoGrid`, `Lightbox`, `resolveAlbumPage` — e permette di aprire un album al suo interno per vederne le foto.

**Dove sta il buco, allora.** Non nella finestra di anteprima, che è quasi completa. Sta in due punti:

1. Il tasto Anteprima **esiste solo nella schermata "Sito"**: nella vista album non c'è.
2. Le operazioni sulle foto — caricamento, eliminazione, riordino, ordinamento — non hanno mai uno stato in sospeso. Quando andresti a guardarle in anteprima, sono già online.

In una riga: *c'è una buona finestra, ma quasi niente da guardarci dentro prima di pubblicare.*

---

## 2. Il problema strutturale: in che direzione si propaga il lavoro

Questo viene prima di ogni altra cosa, perché è già fallito una volta.

**I fatti.** `PhotoPortfolioTemplate` è fermo all'8 luglio, architettura Google Drive, 68 commit, zero commit da allora. `photoportfolio` ha **117 commit**, tutti dall'8 luglio in poi, e un'intera migrazione architetturale. I due repo hanno **storie git completamente separate**: `git merge-base` non trova alcun antenato comune. Non c'è modo di allinearli con un merge o un rebase, oggi.

**La causa immediata, e perché conta più di quanto sembri.** Il primo commit di `photoportfolio` è un `Initial commit` datato 2026-07-08: il repo è nato con **"Use this template" di GitHub**, che crea deliberatamente una storia nuova senza alcun legame con il repo d'origine. La separazione non è una svista: è il comportamento documentato di quella funzione.

Questo ha una conseguenza che va molto oltre il tuo caso. L'audit di luglio si chiudeva con *"Repo → «Use this template» su GitHub"*. Se i tuoi amici partono così, **ognuno di loro si troverà esattamente dove sei tu adesso**: un repo senza antenati comuni con il template, incapace di ricevere qualsiasi aggiornamento futuro con un merge. Il template diventerebbe un punto di partenza usa-e-getta, non una base da cui si continua a ricevere migliorie.

Se vuoi che i cloni possano aggiornarsi, la via d'ingresso non può essere "Use this template". Deve essere un **fork**, oppure un `git clone` seguito dal cambio di `origin` — entrambi conservano la storia e rendono possibile `git merge template/main` per sempre. Costa una riga in più nel README e cambia la natura del progetto: da template morto a base viva.

> **Deciso**: si adotta il **fork su GitHub**. Un click, GitHub configura da solo il remote `upstream`, e ogni miglioria futura arriva con un `git merge upstream/main`. Conseguenza pratica: il repo template va reso **pubblico** (non si forka un repo privato se non dentro la stessa organizzazione), e il README deve spiegare il comando di merge. Chi vuole un repo privato e slegato usa il clone manuale come via secondaria, da documentare in una riga.

**La causa di fondo.** Al di là del meccanismo git, il lavoro vero accade nel sito e il template è a valle: qualsiasi cosa a valle di dove si lavora, e che va aggiornata a mano, prima o poi resta indietro. La roadmap originale (Fase 8) prescriveva già il rapporto giusto — *"migliorie al template nel repo base; i siti derivati le recuperano con un merge dal template"* — ma la pratica ha fatto il contrario.

**La raccomandazione: invertire la direzione.** Il template diventa il repo dove si sviluppa (*upstream*); il tuo sito diventa il primo dei cloni, che accoglie le migliorie con un merge e aggiunge solo configurazione e contenuti propri.

Perché questo risolve il problema alla radice:

- Il template non può invecchiare, perché è il posto dove si lavora.
- Il tuo sito diventa la prova che il template funziona: se una modifica rompe il tuo sito, rompe anche quello dei tuoi amici, e lo scopri subito.
- I tuoi amici stanno verso il template nella stessa identica relazione in cui ci stai tu. Una sola cosa da documentare invece di due.

**Il bootstrap.** Serve creare un antenato comune, una volta sola: si porta l'albero attuale del sito dentro il template con un merge `--allow-unrelated-histories`, su un branch dedicato e via PR. Da quel punto in avanti i due repo condividono storia e i merge successivi sono ordinari. È un'operazione singola, reversibile perché non riscrive niente, e non richiede force push.

> **Deciso**: **il template diventa upstream**, il sito passa a valle. I repo restano due, come scelto, ma il verso del lavoro si inverte.
>
> Conseguenze operative da mettere in conto:
> - Le feature nuove nascono in `PhotoPortfolioTemplate`, non più in `photoportfolio`.
> - `photoportfolio` conserva solo ciò che è personale: `config/`, i valori di `wrangler.json`, eventuali ritocchi di `theme/`. Più la sua superficie personale resta piccola, meno attrito avranno i merge.
> - Il bootstrap con `--allow-unrelated-histories` va fatto **prima** di qualsiasi altro lavoro, altrimenti ogni commit nuovo nasce dalla parte sbagliata.
> - Va deciso, al bootstrap, quale albero vince: quello del sito (architettura attuale) portato nel template. È l'unica direzione sensata, visto che il template è fermo a un'architettura che non esiste più.

---

## 3. Punto 1 — Terraform per l'infrastruttura Cloudflare

### 3.1 Cosa è gestibile da Terraform, davvero

Il provider `cloudflare/cloudflare` v5 copre quasi tutto quello che ti serve:

| Risorsa | Resource Terraform | Note |
|---|---|---|
| Bucket R2 | `cloudflare_r2_bucket` | stabilizzata |
| URL pubblico `r2.dev` | `cloudflare_r2_managed_domain` | **espone il dominio come output** |
| Dominio custom sul bucket | `cloudflare_r2_custom_domain` | richiede zone_id |
| Applicazione Access | `cloudflare_zero_trust_access_application` | ⚠ segnalata come non idempotente |
| Policy Access | `cloudflare_zero_trust_access_policy` | |
| Identity provider | `cloudflare_zero_trust_access_identity_provider` | |
| DNS e dominio del sito | `cloudflare_dns_record` | |
| Worker | `cloudflare_workers_script` | ⚠ vedi §3.2 |

Il fatto che `cloudflare_r2_managed_domain` restituisca il dominio come output è il pezzo che rende Terraform utile qui e non solo elegante: **è esattamente il valore che oggi è scolpito a mano** in `wrangler.json` (`R2_PUBLIC_URL`) e in `public/_headers` (la CSP). Terraform lo produce, e da lì si generano entrambi i file. Lo stesso vale per l'AUD dell'applicazione Access.

Questo fa convergere il punto Terraform con i punti 2 e 3 dell'audit di luglio, che erano proprio "CSP hardcodata" e "wrangler.json da sistematizzare". Non sono tre lavori: è uno.

### 3.2 La tensione da risolvere: chi possiede il Worker

`wrangler deploy` pubblica il Worker. Anche `cloudflare_workers_script` vuole pubblicarlo. Se li lasciamo entrambi padroni della stessa risorsa, si sovrascrivono a vicenda a ogni deploy e lo stato Terraform diverge di continuo.

**Divisione proposta**: Terraform possiede le risorse d'account che cambiano di rado — bucket, domini, Access, DNS. Wrangler possiede il deploy del codice, che cambia a ogni push. Terraform *non* dichiara `cloudflare_workers_script`.

È una divisione che si spiega in una riga nel README e che elimina la classe di problemi peggiore di questo setup.

### 3.3 Dove vive lo stato Terraform

Per un template che altri clonano, lo stato remoto condiviso non ha senso: ogni clone ha la propria infrastruttura. Due opzioni ragionevoli:

- **Stato locale** più `.gitignore`. Semplicissimo, zero setup. Rischio: se perdi il file perdi la mappa, e devi reimportare.
- **Backend S3-compatibile su R2.** Terraform supporta il backend S3 e R2 ne espone l'API. Lo stato vive nel bucket che Terraform stesso ha creato — il che introduce un problema dell'uovo e della gallina al primo `apply`, risolvibile ma da documentare.

Raccomandazione: **stato locale**, documentato. L'infrastruttura qui è cinque o sei risorse; il costo di ricostruirla è basso e il costo cognitivo del backend remoto è più alto del rischio che copre.

### 3.4 Il prezzo, detto chiaro

Terraform aggiunge una dipendenza al setup di chi clona: installare il CLI e creare un API token Cloudflare con permessi ampi (R2, Workers, Access, DNS). Per un fotografo-sviluppatore è alla portata, ma non è gratis in termini di attrito, e va contro l'obiettivo "usabile subito".

L'alternativa onesta è uno **script di setup** che chiama l'API Cloudflare via `wrangler` e `curl`, fa le stesse cose e non richiede Terraform. Più semplice da usare una volta, peggiore da mantenere e senza idempotenza.

Raccomandazione: **Terraform**, ma con il `terraform apply` posizionato come percorso principale documentato e non come prerequisito assoluto — chi vuole può ancora creare le risorse a mano seguendo il runbook. Il valore di Terraform qui non è tanto l'automazione quanto il fatto che **descrive** l'infrastruttura: oggi quella conoscenza esiste solo nella tua testa e in un documento di deploy.

> **Deciso**: Terraform come **percorso principale**, runbook manuale come alternativa supportata. Conseguenza: il runbook non è un ripiego scritto una volta e dimenticato — va tenuto allineato al `.tf`, perché è la seconda via ufficiale. In pratica il `.tf` diventa la fonte, e il runbook si scrive rileggendolo.

### 3.5 Scoperta collaterale: `r2.dev` non va bene in produzione

Verificando i resource Terraform è emerso un problema che riguarda il tuo sito **adesso**, non il template.

`wrangler.json` serve le foto di produzione da un URL `pub-….r2.dev`. La documentazione Cloudflare è esplicita:

> Public access through `r2.dev` subdomains is rate-limited and should only be used for development purposes.

Su `r2.dev` non hai cache, né WAF, né controlli d'accesso. Per un sito che è fatto al 95% di immagini, e che vuoi dare ad amici che ci metteranno i loro portfoli, questo è il collo di bottiglia più serio dell'architettura attuale — e non è visibile finché il traffico è basso.

**La correzione** è un dominio custom sul bucket (`cloudflare_r2_custom_domain`), per esempio `img.tuodominio.it`. Richiede che il dominio sia su Cloudflare, il che è già vero per il sito. Va nello stesso lavoro di Terraform, perché è la stessa risorsa.

Per il template questo diventa una decisione da esporre: o si impone il dominio custom (setup più lungo, ma corretto), o si accetta `r2.dev` come default con un avviso chiaro e il custom domain documentato come passo consigliato. Propendo per la seconda: abbassa la barriera d'ingresso e non mente a chi lo usa.

> **Deciso**: nel template, `r2.dev` **di default** con avviso esplicito nel README, e dominio custom documentato come passo consigliato prima della produzione. Il `.tf` prevede il dominio custom come risorsa opzionale, attivabile da una variabile.
>
> **Per il tuo sito, che è già in produzione, il dominio custom si applica comunque** — è la voce 2 dell'ordine dei lavori (§7). Le due cose non vanno confuse: il default permissivo serve a chi prova il template, non a chi ha un sito online.

---

## 4. Punto 2 — Centralizzazione della personalizzazione

### 4.1 Cosa è già a posto

Meglio di quanto pensassi. `src/styles/admin.css` importa gli stessi token di `theme/tokens.css`: cambiare `--color-accent` ricolora sito pubblico **e** dashboard insieme. Questa è la parte difficile della centralizzazione, ed è già fatta.

### 4.2 La distinzione che va difesa

L'audit di luglio la formula bene e va portata in cima a `CUSTOMIZING.md`, perché è la cosa che confonde chiunque arrivi nuovo:

- **Contenuto** (nome, bio, hero, album, foto) → la verità è **R2**. I file in `config/` sono solo il *seed* iniziale: `npm run migrate` li trasforma in JSON su R2 una volta sola. Rilanciare `migrate` dopo aver usato la dashboard **sovrascrive** il lavoro fatto dalla dashboard.
- **Aspetto e testi di interfaccia** (colori, font, spaziature, copy) → la verità sono i **file**: `theme/`, `config/texts.config.js`.

Il trabocchetto di `migrate` è una trappola reale per chi clona. Va documentato in grassetto, e il comando dovrebbe rifiutarsi di procedere se trova dati già scritti dalla dashboard, a meno di un `--force` esplicito.

### 4.3 Cosa manca

1. **Stringhe della dashboard**, oggi hardcoded in italiano in `views/home.js`, `views/album.js`, `status.js`, `preview.js`. Vanno sotto `texts.admin.*`. Lavoro meccanico ed esteso.
2. **Varianti di card e bordi**, che è la parte nuova rispetto a quanto documentato finora.

### 4.4 Un avvertimento sul punto "card e bordi"

Hai chiesto che siano personalizzabili "i font, i testi, le card utilizzate, i bordi, i colori". Font, testi e colori sono già token: nessun problema.

"Le card utilizzate" è una richiesta di natura diversa: non è un valore, è una **scelta di struttura**. Renderla configurabile significa scrivere più varianti di layout e un meccanismo per selezionarle — e qui c'è un rischio noto: si finisce per costruire un piccolo framework di theming, che moltiplica le combinazioni da testare e che nessuno userà davvero, perché chi clona il repo e sa programmare preferirà modificare il CSS.

Il tuo pubblico sono **sviluppatori**. Per loro, un CSS pulito, ben commentato e con confini chiari vale più di un sistema di varianti.

Raccomandazione: **due o tre varianti di card, nominate e concrete** (per esempio `minimal`, `editoriale`, `cinematic` — hai già i mockup da cui derivarle), selezionabili con un token. Non un sistema generico. Se dopo che tre amici l'hanno usato emerge una quarta esigenza reale, si aggiunge allora.

> **Deciso**: **tre varianti** — `cinematic`, `editoriale`, `minimal` — derivate dai mockup già presenti in `mockups/` (`mockup-1-cinematic.html`, `mockup-3-editoriale.html`, `mockup-4-minimal.html`), selezionabili con un token in `theme/tokens.css`. `mockup-2-split.html` resta fuori per ora.
>
> Vincolo da rispettare in implementazione: le tre varianti devono differire **solo** per CSS, senza rami condizionali nel JS dei componenti. Se una variante richiede una struttura DOM diversa, è il segnale che stiamo scivolando verso il sistema generico che abbiamo scartato.

---

## 5. Punto 3 — Anteprima completa

Vedi §1.1 per lo stato verificato, che è più avanzato di quanto la prima stesura sostenesse.

**Quello che c'è già e non va rifatto**: lo schema "in sospeso → Salva → guardia all'uscita" è scritto e testato in due posti; l'overlay di anteprima disegna il sito con i componenti veri e sa già aprire un album.

**Quello che manca** è circoscritto a due cose:

1. **Il tasto Anteprima nella vista album.** Lì descrizione e cover sono già in sospeso, quindi c'è già qualcosa da mostrare e l'overlay sa già disegnarlo. Lavoro piccolo, mezza giornata scarsa.
2. **Lo stato in sospeso per le operazioni sulle foto** — caricamento, eliminazione, riordino, ordinamento. Questa è la parte vera, e la difficoltà non sta nella UI ma nello storage:
   - serve un manifest **bozza** distinto dal **pubblicato**, e la promozione dell'uno sull'altro;
   - una foto caricata e poi scartata lascia comunque il binario su R2, perché l'upload è già avvenuto: servono una pulizia degli orfani e una politica su quando eseguirla;
   - il sito pubblico va istruito a leggere il manifest bozza quando richiesto in anteprima, autenticato.

La stima di 3–5 giorni della prima stesura era tarata sull'idea sbagliata che andasse riscritta ogni vista. Con lo schema pending già esistente, il grosso è il manifest bozza e la pulizia degli orfani.

È comunque l'unico dei quattro punti che **non blocca** la distribuzione: il template funziona con il salvataggio immediato.

> **Deciso: rimandata**, da riconsiderare dopo aver raccolto il feedback dei primi utilizzatori. Il template si distribuisce con il salvataggio immediato per le operazioni sulle foto.
>
> Decisione **riconfermata il 2026-09-20** dopo la correzione di §1.1, cioè sapendo che il lavoro residuo è minore di quanto la prima stima dicesse. Anche l'aggiunta del solo tasto Anteprima nella vista album (mezza giornata) è stata valutata e rimandata insieme al resto, per non lasciare un mezzo intervento in mezzo al guado.
>
> Perché resta la scelta giusta: non esiste alcuna prova che il salvataggio immediato dia fastidio nell'uso reale. Se il fastidio è reale, il feedback dirà anche *quali* operazioni contano — e il lavoro sarà più mirato di quanto potremmo progettarlo adesso.
>
> Conseguenza sul design attuale: l'asimmetria **resta com'è** (alcune cose si salvano, altre vanno subito online) e va dichiarata in `CUSTOMIZING.md` come stato noto e voluto, non lasciata sembrare una svista.
>
> Domanda da porre esplicitamente ai primi utilizzatori: *"ti è mai capitato di caricare o riordinare foto e desiderare di annullare prima che fossero online?"*

---

## 6. Punto 4 — Igiene del template

Dall'audit di luglio, ancora tutto aperto e ancora valido:

1. `CUSTOMIZING.md` riscritto — parla ancora di Google Drive, `driveApiKey`, `driveFolderId`, `lh3.googleusercontent.com`. Architettura che non esiste più.
2. CSP generata a build time invece che scolpita in `public/_headers`.
3. `wrangler.json` con placeholder coerenti su tutti i campi.
4. Runbook Cloudflare consolidato.

I punti 2 e 3 si risolvono da soli se si fa Terraform (§3.1): sono gli output di Terraform scritti nei file.

---

## 7. Ordine consigliato

Aggiornato con le decisioni di §8.

| # | Lavoro | Perché qui | Grandezza |
|---|---|---|---|
| 0 | Bootstrap: albero del sito dentro il template con `--allow-unrelated-histories`, template reso pubblico e promosso a upstream | senza, ogni lavoro successivo nasce dalla parte sbagliata | mezza giornata |
| 1 | Terraform + CSP generata + wrangler parametrico + runbook | un lavoro solo, stessi valori; sblocca la distribuzione | 2–3 giorni |
| 2 | Dominio custom sul bucket, per il sito in produzione | corregge un problema già attivo; stessa area di 1 | mezza giornata |
| 3 | `CUSTOMIZING.md` riscritto + guardia su `migrate` + README con il flusso fork/merge | senza, il template è inutilizzabile da altri | 1 giorno |
| 4 | Stringhe admin in `texts.config.js` + tre varianti di card | completa la centralizzazione | 2 giorni |
| — | Anteprima per le operazioni sulle foto | **rimandata** in attesa di feedback (§5) | da ristimare, minore di 3–5 gg |

Stime grossolane, da rivedere quando ciascun punto avrà il suo piano.

**Dopo il punto 3 il template è già condivisibile.** Il punto 4 lo migliora ma non blocca i tuoi amici. Se l'obiettivo è dare il repo a qualcuno entro poco, la linea di arrivo è il punto 3.

Dal punto 1 in avanti il lavoro si svolge **nel repo template**, non più qui: è la conseguenza diretta della decisione di §8.2.

---

## 8. Decisioni prese

Chiuse in conversazione il 2026-09-20. Ciascuna è riportata anche in fondo alla sezione che la riguarda.

| # | Decisione | Esito | Rif. |
|---|---|---|---|
| 1 | Via d'ingresso per chi clona | **Fork su GitHub** — conserva la storia, aggiornamenti con `git merge upstream/main`. Il template va reso pubblico. | §2 |
| 2 | Direzione di propagazione | **Template upstream**, sito a valle. Le feature nuove nascono nel template. | §2 |
| 3 | Dominio delle foto | **`r2.dev` di default** con avviso, custom documentato e opzionale nel `.tf`. Sul sito in produzione il custom si applica comunque. | §3.5 |
| 4 | Ruolo di Terraform | **Percorso principale**, runbook manuale come alternativa supportata e mantenuta. | §3.4 |
| 5 | Varianti di card | **Tre** — `cinematic`, `editoriale`, `minimal` — dai mockup esistenti, solo CSS. | §4.4 |
| 6 | Anteprima completa | **Rimandata**, riconfermata il 2026-09-20 dopo la correzione di §1.1. | §5 |

### 8.1 Quello che le decisioni implicano, e che non era nelle domande

Tre conseguenze meritano di essere dette prima che diventino sorprese:

1. **Il repo template deve diventare pubblico** perché il fork funzioni fuori dal tuo account. Finché resta privato, i tuoi amici non possono forkarlo. Va verificato che nella storia che ci porteremo dietro non ci sia nulla di personale o sensibile — è un controllo da fare al bootstrap (punto 0), non dopo.

2. **Il tuo sito diventerà un clone a valle**, quindi ogni personalizzazione che lasci fuori da `config/` e `theme/` diventerà attrito a ogni merge. Vale la pena, al bootstrap, verificare quanto della tua personalizzazione è già confinata lì.

3. **Le voci 1 e 4 dell'ordine dei lavori si svolgono nel template**, non in questo repo. Questa analisi è l'ultimo documento che nasce qui: da subito dopo il bootstrap, la documentazione di progetto vive nel template.

### 8.1-bis Dove finiscono le azioni che spettano a una persona

Le voci che richiedono i tuoi permessi o una tua scelta — aprire la PR, decidere cosa
fare di `docs/`, rendere pubblico il repo, togliere la spunta "Template repository" —
sono raccolte in [docs/azioni-manuali.md](../../azioni-manuali.md), con l'indicazione
di cosa bloccano e cosa no. **Nessuna di esse blocca il punto 1.**

### 8.2 Domande che restano aperte davvero

Non bloccano l'inizio dei lavori, ma vanno risolte lungo la strada:

- Il repo template mantiene il nome `PhotoPortfolioTemplate`, o ne vuole uno più adatto a essere pubblico?
- Il dominio custom del punto 2 (`img.tuodominio.it` o simile): quale dominio, e su quale zona Cloudflare?
- Lo stato Terraform resta locale come raccomandato in §3.3, o preferisci il backend su R2?

---

## 9. Nota di metodo

Questa analisi è stata scritta dopo aver letto il codice su `staging`, non ricostruita a memoria dalla conversazione. Dove la conversazione e il codice divergevano (§1.1) ho seguito il codice.

Le decisioni di §8 sono state prese in conversazione dopo la prima stesura, e sono state riportate sia nella tabella riepilogativa sia in fondo a ciascuna sezione interessata, così che leggendo una sezione da sola non si possa scambiare la raccomandazione per la decisione.

Non è stata scritta né modificata alcuna riga di codice dell'applicazione.
