# Stringhe di codice in inglese — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Togliere l'ultimo italiano che un utente o uno sviluppatore vede davvero — messaggi di errore, output dei comandi, e il testo della notifica che arriva sul telefono — dopo che commenti e JSDoc sono già passati all'inglese.

**Architecture:** Due categorie con destini diversi. La maggior parte sono stringhe rivolte a sviluppatori — errori lanciati, messaggi di validazione, output CLI — e si traducono dove stanno. Tre invece sono testi d'interfaccia rimasti indietro dal punto 4: quelli non si traducono, si **spostano** in `config/texts.config.js`, dove il punto 4 ha stabilito che vivano.

**Tech Stack:** Node 20+, vitest. Nessuna dipendenza nuova.

**Spec:** nessuna. Deriva dalla revisione del lavoro sui commenti, che ha trovato queste stringhe fuori dal proprio perimetro.

## Global Constraints

Dal `CLAUDE.md` di `/srv/claude/workspaces/`:

- **Mai `git push --force`**, mai cancellare rami remoti, mai `--no-verify`. Push bloccato → fermarsi e segnalare.
- **Mai committare su `main`.** Branch dedicato e PR.
- Si lavora solo dentro `/srv/claude/workspaces/`. Ogni file cancellato va dichiarato.
- **Non leggere, copiare o stampare credenziali.**
- Identità commit `VPS Agent <agent@vps-agent.invalid>`, già globale.

Ogni commit termina con:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Vincoli di questo lavoro:

- **Si cambiano solo stringhe.** Nessuna condizione, nessun nome di variabile, nessun ramo. I nomi delle variabili italiane (`messaggio`, `esistenti`, `dichiarata`) **restano come sono**: rinominarli è un lavoro diverso, e mescolarlo a questo renderebbe il diff illeggibile.
- **`npm run build` da solo fallisce apposta**: usare `ALLOW_PLACEHOLDER_CSP=1 npm run build`.
- **L'impronta del bundle cambierà**, ed è previsto: le stringhe entrano nel bundle. La rete di sicurezza qui è un'altra, ed è nel Task 4.
- Branch: `stringhe-in-inglese`, creato da `commenti-e-jsdoc`.
- Test di partenza: **361**. Devono restare 361.

## L'inventario, misurato

| File | Stringhe | Categoria |
|---|---|---|
| `src/shared/content-rules.js` | 27 | messaggi di validazione |
| `src/shared/contact-rules.js` | 4 | messaggi di validazione |
| `scripts/compress.js` | 6 | output CLI |
| `scripts/migrate.js` | 3 | output CLI |
| `src/utils/validateConfig.js` | 3 | errori lanciati |
| `src/utils/decideMigration.js` | 2 | output CLI |
| `src/utils/buildHeaders.js` | 2 | errori lanciati |
| `src/utils/notifyBody.js` | 1 | **la notifica sul telefono** |
| `src/worker/contact-routes.js` | 1 | log del Worker |
| `src/admin/views/home.js` | 2 | **interfaccia → vanno spostate** |
| `src/pages/admin.js` | 1 | **interfaccia → va spostata** |

---

### Task 1: I messaggi rivolti a chi sviluppa

Errori lanciati, messaggi di validazione, output dei comandi. Si traducono dove stanno: non sono interfaccia, sono diagnostica.

**Files:**
- Modify: `src/shared/content-rules.js`, `src/shared/contact-rules.js`, `src/utils/validateConfig.js`, `src/utils/buildHeaders.js`, `src/worker/contact-routes.js`, `scripts/compress.js`, `scripts/migrate.js`

**Interfaces:**
- Consumes: niente
- Produces: niente di nuovo — cambiano solo i testi

- [ ] **Step 1: Creare il branch**

```bash
cd /srv/claude/workspaces/PhotoPortfolioTemplate
git checkout commenti-e-jsdoc && git checkout -b stringhe-in-inglese
npm test 2>&1 | grep -E 'Tests'
```

Atteso: 361.

- [ ] **Step 2: Tradurre**

Regole di traduzione, perché queste stringhe finiscono davanti a chi si è appena bloccato:

- **Conservare i nomi tecnici esatti**: `site.hero.album`, `coverName`, `R2_PUBLIC_URL`, `--force`, `--input`, `optimized/`, `originali/`. Sono percorsi e opzioni reali: tradurli produrrebbe istruzioni che non funzionano.
- **Conservare i valori interpolati** (`${a.slug}`, `${file}`, `${key}`) e i simboli `✓` e `✗`.
- **Dire cosa fare**, quando l'originale lo dice: `'Errore: --input è obbligatorio'` → `'Error: --input is required'`, non un generico `'Invalid arguments'`.

Esempi del registro atteso:

| Prima | Dopo |
|---|---|
| `'site.name obbligatorio'` | `'site.name is required'` |
| `` `slug invalido: "${a?.slug}"` `` | `` `invalid slug: "${a?.slug}"` `` |
| `'manifest: non è un array'` | `'manifest: not an array'` |
| `'Errore: la cartella "optimized/" non esiste in "${inputRoot}".\n'` | `'Error: folder "optimized/" not found in "${inputRoot}".\n'` |
| `'notifica fallita:'` | `'notification failed:'` |

- [ ] **Step 3: Verificare**

```bash
npm test 2>&1 | grep -E 'Tests'
```

Atteso: **361**. I test di `content-rules` e `contact-rules` verificano `ok: false`, non il testo del messaggio, quindi devono passare senza modifiche. **Se un test fallisce, fermarsi e riferire**: significa che qualcosa dipendeva dal testo italiano, ed è un'informazione che voglio sapere prima che venga "sistemata".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "i18n: messaggi di diagnostica in inglese

Errori lanciati, messaggi di validazione e output dei comandi: sono le
frasi che vede chi si e' appena bloccato durante il setup, e in un
template inglese erano l'ultima cosa che parlava italiano.

Conservati nomi tecnici, opzioni e valori interpolati: tradurre
--input o optimized/ avrebbe prodotto istruzioni che non funzionano.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 2: La notifica e il messaggio di `migrate`

Due stringhe a parte, perché non sono diagnostica: **le legge il proprietario del sito**, e una gli arriva sul telefono.

**Files:**
- Modify: `src/utils/notifyBody.js`, `src/utils/decideMigration.js`, `src/utils/decideMigration.test.js`

**Interfaces:**
- Consumes: niente
- Produces: niente di nuovo

- [ ] **Step 1: La notifica**

In `src/utils/notifyBody.js`:

```js
return `New message from ${nome}. Read it at ${adminUrl}`;
```

Il JSDoc del file resta invariato: dice già, correttamente, che il testo del messaggio e l'email di chi scrive non escono mai di lì.

- [ ] **Step 2: Il messaggio di `decideMigration`**

Tradurre i due rami. **Devono continuare a contenere le parole `--force` e `dashboard`**, e il ramo `force` deve contenere `overwrit` (in `overwriting` o `overwrite`): i test lo verificano.

Registro atteso per il ramo che blocca:

> `Already on R2: <elenco>.` — `migrate` initializes the site once. Running it now resets name, bio, hero and albums to the values in `config/`, discarding what you did from the dashboard. — `If that is really what you want: npm run migrate -- --force`

- [ ] **Step 3: Adeguare i due test che dipendono dall'italiano**

In `src/utils/decideMigration.test.js` ci sono due asserzioni su `/sovrascriv/i`:

```js
    expect(d.messaggio).toMatch(/sovrascriv/i);
```
```js
    expect(d.messaggio).not.toMatch(/sovrascriv/i);
```

Diventano `/overwrit/i` in entrambe.

C'è **un secondo adeguamento consentito**, scoperto durante l'esecuzione perché l'inventario di questo piano lo aveva mancato: in `src/utils/buildHeaders.test.js` riga 63, `.toThrow(/segnaposto/)` diventa `.toThrow(/placeholder/)`.

Sono gli **unici due** adeguamenti consentiti, ed entrambi sono della stessa natura: il test verifica che il messaggio contenga un certo concetto — la sovrascrittura, il segnaposto — e quella parola in inglese è un'altra. La verifica resta la stessa.

Una ricerca su tutto il repo conferma che gli accoppiamenti a parole italiane sono **esattamente tre**, tutti qui elencati. Qualunque altro test fallisca, **fermarsi e riferire** invece di adeguarlo: significherebbe un accoppiamento che nessuno aveva previsto.

**I nomi dei test restano in italiano.** `it('rifiuta un segnaposto non sostituito', …)` va bene così: non sono stringhe di prodotto.

- [ ] **Step 4: Verificare**

```bash
npm test 2>&1 | grep -E 'Tests'
```

Atteso: 361.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "i18n: la notifica e l'avviso di migrate in inglese

Queste due le legge il proprietario del sito, e la prima gli arriva sul
telefono: un template inglese che manda notifiche in italiano e' la
stonatura piu' visibile che restava.

Adeguate le due asserzioni di decideMigration.test.js che cercavano
/sovrascriv/i: il test verifica che il messaggio avverta della
sovrascrittura, e in inglese quella parola e' un'altra.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 3: I tre testi d'interfaccia rimasti indietro

Questi **non si traducono dove stanno**: si spostano in `config/texts.config.js`, sezione `admin`. Il punto 4 ha stabilito che i testi della dashboard vivono lì perché chi forka possa tradurli senza toccare il JavaScript — questi tre sono sfuggiti.

**Files:**
- Modify: `config/texts.config.js`, `src/admin/views/home.js`, `src/pages/admin.js`, e i test di quelle viste se asseriscono su quei testi

**Interfaces:**
- Consumes: `formatText` da `src/utils/formatText.js`, per la stringa con il nome dell'album
- Produces: tre chiavi nuove sotto `texts.admin`

- [ ] **Step 1: Aggiungere le chiavi**

In `config/texts.config.js`, dentro `admin`:

```js
    site: {
      // …chiavi esistenti…
      heroNone: 'nessuna',
    },
    albums: {
      // …chiavi esistenti…
      deleteConfirmPrompt: 'Per eliminare scrivi il nome esatto dell\'album: "{titolo}"',
      loadError: 'Impossibile caricare gli album (rete o dati malformati).',
    },
```

I valori restano in italiano: sono il copy predefinito del sito, e cambiarne la lingua è una decisione a parte, non parte di questo lavoro.

- [ ] **Step 2: Usarle al posto delle stringhe fisse**

- `src/admin/views/home.js` riga ~43: `<em>nessuna</em>` → il valore da `texts.admin.site.heroNone`.
- `src/admin/views/home.js` riga ~142: il prompt di conferma → `formatText(texts.admin.albums.deleteConfirmPrompt, { titolo: a.title })`.
- `src/pages/admin.js` riga ~59: il messaggio di errore → `texts.admin.albums.loadError`.

- [ ] **Step 3: Verificare**

```bash
npm test 2>&1 | grep -E 'Tests'
ALLOW_PLACEHOLDER_CSP=1 npm run build 2>&1 | tail -1
```

Atteso: 361 test e build riuscita.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(admin): tre testi d'interfaccia rimasti fuori da texts.config.js

Il punto 4 ha spostato i testi della dashboard in configurazione perche'
chi forka possa tradurli senza toccare il JavaScript. Tre erano
sfuggiti: il segnaposto della hero, il prompt di conferma eliminazione
album e l'errore di caricamento.

Non tradotti ma spostati: la lingua del copy predefinito e' una
decisione a parte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 4: La verifica che qui sostituisce l'impronta

Nel lavoro sui commenti la rete era l'impronta del bundle, che doveva restare identica. Qui **cambierà di sicuro**, perché le stringhe finiscono nel bundle. Serve un'altra prova che sia cambiato solo ciò che doveva cambiare.

**Files:**
- Nessuna modifica prevista.

- [ ] **Step 1: Nessuna riga aggiunta o tolta dove si è solo tradotto**

```bash
git diff commenti-e-jsdoc..HEAD --numstat -- \
  src/shared src/utils/validateConfig.js src/utils/buildHeaders.js \
  src/utils/notifyBody.js src/worker/contact-routes.js scripts
```

Atteso: per **ogni** file, righe aggiunte e righe tolte **uguali**. Tradurre una stringa sostituisce una riga; non ne aggiunge né ne toglie. Se un file mostra numeri diversi, lì è successo altro e va guardato.

I file del Task 3 sono esclusi da questo controllo: lì si sposta codice, quindi i numeri differiscono legittimamente.

- [ ] **Step 2: Non è rimasto italiano nelle stringhe**

```bash
python3 - <<'PY'
import re, subprocess, pathlib
files = [f for f in subprocess.run(['git','ls-files','src','scripts'],capture_output=True,text=True).stdout.split()
         if f.endswith('.js') and '.test.' not in f]
it = re.compile(r"\b(mancante|impossibile|fallita|fallito|errore|valido|valida|riprova|segnaposto|caricato|nessun|nessuna|sovrascriv|obbligatorio|esiste|esistono|premi|selezionata|annullata|salvato|ordinate)\b", re.I)
for f in files:
    for i, riga in enumerate(pathlib.Path(f).read_text().split('\n'), 1):
        codice = re.sub(r'//.*$', '', riga)
        for s in re.findall(r"'([^']{8,})'|\"([^\"]{8,})\"|`([^`]{8,})`", codice):
            t = next(x for x in s if x)
            if it.search(t):
                print(f'{f}:{i}  {t[:70]}')
print('--- fine elenco ---')
PY
```

Atteso: elenco vuoto. `config/texts.config.js` è escluso di proposito: è il copy del sito.

- [ ] **Step 3: Rileggere il diff**

```bash
git diff commenti-e-jsdoc..HEAD -- '*.js' | grep -E '^[+-]' | grep -vE '^[+-][+-]' | grep -vE "['\"\`]" | head -20
```

Atteso: nessuna riga, o solo righe di struttura dei file del Task 3. Una riga cambiata che **non contiene una stringa** è una riga di logica, e non doveva essere toccata.

- [ ] **Step 4: Riferire**

Numero di test, esito dei tre controlli, e qualunque cosa sia sembrata strana.

---

## Self-Review

**Copertura.** Le undici voci dell'inventario sono coperte: otto file dal Task 1, due dal Task 2, tre stringhe in due file dal Task 3.

**Segnaposto.** Nessun TBD. Le traduzioni non sono riportate una per una ed è deliberato: sono quarantacinque stringhe, e riscriverle qui significherebbe scriverle due volte. Quello che il piano fissa — ed è la parte che conta — sono **le regole di traduzione** (nomi tecnici e interpolazioni intatti) e **i tre esempi di registro**.

**Coerenza.** Il numero atteso dei test è 361 in tutti i task. `formatText` è già nel repo dal punto 4 e il Task 3 la usa con la stessa firma.

**Il rischio principale, dichiarato.** È che un test fallisca e venga adeguato invece che segnalato. Il piano consente **un solo** adeguamento — le due asserzioni su `/sovrascriv/i` — e dice esplicitamente che qualunque altro fallimento va riferito. Un test che dipende da un testo italiano è un accoppiamento che voglio vedere, non uno da far sparire.
