# M6 — Script di compressione locale Design Spec

**Date:** 2026-07-07
**Milestone:** M6

---

## Goal

Uno script Node.js eseguibile localmente che legge le foto originali da una cartella del filesystem e genera un'unica cartella `optimized/` con versioni WebP ridimensionate al massimo necessario per il lightbox (1900px). Il fotografo carica su Google Drive solo `optimized/`; il provider Drive esistente applica i suffissi `=s400` e `=s900` esattamente come fa oggi, senza alcuna modifica al frontend.

---

## Scope

M6 aggiunge solo uno strumento di sviluppo (`scripts/compress.js`). Nessuna modifica al frontend, nessuna modifica al provider Drive, nessuna modifica al sito.

Il flusso del fotografo:

```
1. Aggiunge/rimuove foto in  <root>/originali/
2. Esegue:  npm run compress -- --input <root>
3. Lo script rigenera       <root>/optimized/
4. Carica su Google Drive SOLO la cartella optimized/
5. Il provider Drive legge da quella cartella (folderId invariato)
```

Drive continua ad applicare `=s400` per la griglia e `=s900` per il lightbox sui file WebP, esattamente come fa oggi sugli originali JPEG. Nessuna foto duplicata, nessun cambiamento al provider.

---

## Struttura cartelle

```
<root>/               ← percorso passato con --input
  originali/          ← foto originali del fotografo (non modificate, non caricate)
  optimized/          ← generato dallo script → da caricare su Drive
```

Lo script svuota completamente `optimized/` ad ogni esecuzione e la ricrea da `originali/`. La cancellazione di una foto da `originali/` si riflette automaticamente al prossimo run.

---

## Configurazione output

| | Lato lungo max | Qualità WebP | Note |
|--|---------------|--------------|------|
| **optimized** | 1900px | 85 | Copre lightbox (=s900 di Drive) e oltre. Drive gestisce il downscale per la griglia (=s400) |

- **Algoritmo resize:** Lanczos3 (kernel più nitido per downscaling di fotografie)
- **Formato output:** WebP (25-35% più leggero di JPEG a parità qualità visiva; supportato da Drive CDN con i suffissi =sXXX)
- **Metadata:** rimossi (privacy GPS + riduzione peso)
- **Nome file:** `originale.jpg` → `originale.webp` (estensione sostituita, nome invariato)

---

## Formati input supportati

JPEG (`.jpg`, `.jpeg`), PNG (`.png`), HEIC (`.heic`), TIFF (`.tif`, `.tiff`), WebP (`.webp`)

**Non supportati:** RAW (CR2, NEF, ARW, ecc.) — il fotografo esporta in JPEG da Lightroom prima di usare lo script.

---

## Interfaccia CLI

```bash
npm run compress -- --input /Volumes/SSD/Portfolio
```

Flag supportati:

| Flag | Obbligatorio | Descrizione |
|------|-------------|-------------|
| `--input` | sì | Percorso root contenente `originali/` |
| `--help` | no | Mostra usage e termina |

Lo script valida che `--input` esista e che `originali/` sia presente al suo interno. Se mancano, stampa un errore leggibile e termina con exit code 1.

---

## Output CLI durante l'esecuzione

```
📁 Input:  /Volumes/SSD/Portfolio/originali  (12 foto)
🗑  Svuoto optimized/...
⚙  [1/12] alba_01.jpg → alba_01.webp
⚙  [2/12] tramonto_02.heic → tramonto_02.webp
...
✅ Completato: 12 foto ottimizzate in 4.2s
```

Errori per singolo file vengono loggati ma non interrompono l'elaborazione degli altri.

---

## Dipendenze

- **`sharp`** aggiunto a `devDependencies` — libreria Node.js per image processing, zero dipendenze runtime per il sito.

---

## File coinvolti

| Azione | File |
|--------|------|
| Crea | `scripts/compress.js` |
| Modifica | `package.json` (devDependency sharp + script compress) |

Nessun altro file del progetto viene modificato.

---

## Fuori scope

- Modifiche al provider Drive o al frontend
- Watch mode (ricompressione automatica al salvataggio)
- Supporto RAW
- Upload automatico su Drive
- Cartelle separate per thumbnail e preview (Drive le gestisce tramite =sXXX)
