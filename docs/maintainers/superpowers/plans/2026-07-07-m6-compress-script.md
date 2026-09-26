# M6 — Script di compressione locale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uno script CLI Node.js (`scripts/compress.js`) che legge foto da `originali/`, genera versioni WebP ottimizzate in `optimized/`, e si esegue con `npm run compress -- --input <percorso>`.

**Architecture:** Lo script esporta tre funzioni pure (`parseArgs`, `isSupportedFile`, `processDir`) testate con Vitest in ambiente Node. Il punto d'ingresso `main()` non è esportato ed è protetto dal guard `import.meta.url` per non eseguirsi durante i test. Sharp fa tutto il processing: resize Lanczos3, strip metadata, encode WebP.

**Tech Stack:** Node.js ESM, Sharp 0.33+, Vitest 4.x (`@vitest-environment node`).

## Global Constraints

- Sharp installato come `devDependency` — zero dipendenze runtime per il sito.
- Output: WebP, qualità 85, lato lungo max 1900px, kernel `lanczos3`, `withoutEnlargement: true`.
- Metadata rimossi (`withMetadata(false)`).
- Input supportati: `.jpg`, `.jpeg`, `.png`, `.heic`, `.tif`, `.tiff`, `.webp` (case-insensitive).
- `optimized/` viene svuotata e ricreata ad ogni run (full regeneration).
- Errori su singolo file: loggati su stderr, non interrompono gli altri file.
- Exit code 1 su: `--input` mancante, cartella root non esistente, `originali/` non trovata.
- Script ESM: guard `if (process.argv[1] === fileURLToPath(import.meta.url))` protegge `main()`.
- Test file usa `// @vitest-environment node` per non ereditare jsdom dal config globale.

---

### Task 1: Installazione Sharp e scaffold

**Files:**
- Modifica: `package.json`

---

- [ ] **Step 1: Installa Sharp come devDependency**

```bash
npm install --save-dev sharp
```

Expected: `sharp` appare in `devDependencies` di `package.json`. Nessun errore di build nativa — Sharp usa binari pre-compilati per macOS.

- [ ] **Step 2: Aggiungi lo script `compress` in `package.json`**

Aprire `package.json` e aggiungere nella sezione `"scripts"`:

```json
"compress": "node scripts/compress.js"
```

Il blocco scripts completo deve risultare:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run --passWithNoTests",
  "compress": "node scripts/compress.js"
}
```

- [ ] **Step 3: Verifica che i test esistenti passino ancora**

```bash
npm test
```

Expected:
```
Test Files  12 passed (12)
     Tests  75 passed (75)
```

Sharp è una devDependency Node-only — non deve influenzare i test Vitest esistenti.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install sharp, add compress npm script"
```

---

### Task 2: Implementazione e test di compress.js

**Files:**
- Crea: `scripts/compress.js`
- Crea: `scripts/compress.test.js`

**Interfaces prodotte:**
- `parseArgs(argv: string[]): { input: string | null, help: boolean }`
- `isSupportedFile(filename: string): boolean`
- `processImage(inPath: string, outPath: string): Promise<void>`
- `processDir(originaliDir: string, optimizedDir: string): Promise<{ ok: number, errors: number, elapsed: number }>`

---

- [ ] **Step 1: Crea il file di test**

Creare `scripts/compress.test.js` con il contenuto seguente:

```js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { parseArgs, isSupportedFile, processImage, processDir } from './compress.js';

describe('parseArgs', () => {
  it('estrae --input', () => {
    expect(parseArgs(['--input', '/path/to/folder']))
      .toEqual({ input: '/path/to/folder', help: false });
  });

  it('estrae --help', () => {
    expect(parseArgs(['--help']))
      .toEqual({ input: null, help: true });
  });

  it('restituisce input null se --input è assente', () => {
    expect(parseArgs([]))
      .toEqual({ input: null, help: false });
  });

  it('ignora --input senza valore successivo', () => {
    expect(parseArgs(['--input']))
      .toEqual({ input: null, help: false });
  });
});

describe('isSupportedFile', () => {
  it('accetta le estensioni supportate (case-insensitive)', () => {
    for (const name of ['foto.jpg', 'foto.JPEG', 'foto.png', 'foto.heic', 'foto.tif', 'foto.tiff', 'foto.webp']) {
      expect(isSupportedFile(name), name).toBe(true);
    }
  });

  it('rifiuta RAW e altri formati', () => {
    for (const name of ['foto.cr2', 'foto.nef', 'foto.arw', 'doc.pdf', '.DS_Store', 'foto']) {
      expect(isSupportedFile(name), name).toBe(false);
    }
  });
});

describe('processImage', () => {
  let testRoot;

  beforeAll(async () => {
    testRoot = join(tmpdir(), `compress-img-test-${Date.now()}`);
    await mkdir(testRoot, { recursive: true });
    await sharp({
      create: { width: 200, height: 300, channels: 3, background: { r: 180, g: 100, b: 50 } },
    })
      .jpeg()
      .toFile(join(testRoot, 'input.jpg'));
  });

  afterAll(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('converte JPEG in WebP e rispetta withoutEnlargement', async () => {
    const outPath = join(testRoot, 'output.webp');
    await processImage(join(testRoot, 'input.jpg'), outPath);
    const meta = await sharp(outPath).metadata();
    expect(meta.format).toBe('webp');
    // 200×300 < 1900 su entrambi i lati: non deve essere ingrandita
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(300);
  });
});

describe('processDir', () => {
  let testRoot;
  let originaliDir;
  let optimizedDir;

  beforeAll(async () => {
    testRoot = join(tmpdir(), `compress-dir-test-${Date.now()}`);
    originaliDir = join(testRoot, 'originali');
    optimizedDir = join(testRoot, 'optimized');
    await mkdir(originaliDir, { recursive: true });

    // Immagine 200×300 JPEG
    await sharp({
      create: { width: 200, height: 300, channels: 3, background: { r: 180, g: 100, b: 50 } },
    })
      .jpeg()
      .toFile(join(originaliDir, 'test.jpg'));

    // File non supportato — deve essere ignorato
    await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toFile(join(originaliDir, 'thumbs.db'));
  });

  afterAll(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('genera test.webp nella cartella optimized/', async () => {
    const result = await processDir(originaliDir, optimizedDir);
    expect(result.ok).toBe(1);
    expect(result.errors).toBe(0);
    expect(existsSync(join(optimizedDir, 'test.webp'))).toBe(true);
  });

  it('output è WebP con dimensioni ≤ 1900px su ogni lato', async () => {
    const meta = await sharp(join(optimizedDir, 'test.webp')).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(1900);
    expect(meta.height).toBeLessThanOrEqual(1900);
  });

  it('non ingrandisce immagini già piccole (200×300 rimane 200×300)', async () => {
    const meta = await sharp(join(optimizedDir, 'test.webp')).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(300);
  });

  it('una seconda esecuzione svuota e rigenera optimized/', async () => {
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .webp()
      .toFile(join(optimizedDir, 'vecchio.webp'));

    await processDir(originaliDir, optimizedDir);

    expect(existsSync(join(optimizedDir, 'test.webp'))).toBe(true);
    expect(existsSync(join(optimizedDir, 'vecchio.webp'))).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui i test — devono fallire**

```bash
npm test
```

Expected: i test di `compress.test.js` falliscono con `Cannot find module './compress.js'`. I 75 test esistenti devono continuare a passare.

- [ ] **Step 3: Implementa `scripts/compress.js`**

Creare `scripts/compress.js` con il contenuto seguente:

```js
import sharp from 'sharp';
import { readdir, rm, mkdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.tif', '.tiff', '.webp']);
const MAX_DIMENSION = 1900;
const WEBP_QUALITY = 85;
const CONCURRENCY = 4;

/**
 * @param {string[]} argv - Array di argomenti CLI (es. process.argv.slice(2)).
 * @returns {{ input: string | null, help: boolean }}
 */
export function parseArgs(argv) {
  const result = { input: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') result.help = true;
    if (argv[i] === '--input' && argv[i + 1]) result.input = argv[++i];
  }
  return result;
}

/**
 * @param {string} filename - Nome del file con estensione.
 * @returns {boolean}
 */
export function isSupportedFile(filename) {
  return SUPPORTED_EXTS.has(extname(filename).toLowerCase());
}

/**
 * @param {string} inPath - Percorso assoluto del file sorgente.
 * @param {string} outPath - Percorso assoluto del file di output (.webp).
 * @returns {Promise<void>}
 */
export async function processImage(inPath, outPath) {
  await sharp(inPath)
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      kernel: 'lanczos3',
      withoutEnlargement: true,
    })
    .withMetadata(false)
    .webp({ quality: WEBP_QUALITY })
    .toFile(outPath);
}

/**
 * @param {string} originaliDir - Percorso assoluto della cartella sorgente.
 * @param {string} optimizedDir - Percorso assoluto della cartella di output.
 * @returns {Promise<{ ok: number, errors: number, elapsed: number }>}
 */
export async function processDir(originaliDir, optimizedDir) {
  const files = (await readdir(originaliDir)).filter(isSupportedFile);

  await rm(optimizedDir, { recursive: true, force: true });
  await mkdir(optimizedDir, { recursive: true });

  let totalErrors = 0;
  const start = Date.now();

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (file, j) => {
        const idx = i + j + 1;
        const outName = basename(file, extname(file)) + '.webp';
        process.stdout.write(`⚙  [${idx}/${files.length}] ${file} → ${outName}\n`);
        try {
          await processImage(join(originaliDir, file), join(optimizedDir, outName));
          return true;
        } catch (err) {
          process.stderr.write(`  ✗ Errore su ${file}: ${err.message}\n`);
          return false;
        }
      })
    );
    totalErrors += results.filter(r => !r).length;
  }

  return { ok: files.length - totalErrors, errors: totalErrors, elapsed: Date.now() - start };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`
Uso: npm run compress -- --input <percorso>

  --input <percorso>   Cartella root contenente originali/
  --help               Mostra questo messaggio
\n`);
    process.exit(0);
  }

  if (!args.input) {
    process.stderr.write('Errore: --input è obbligatorio.\n');
    process.exit(1);
  }

  const inputRoot = args.input;
  const originaliDir = join(inputRoot, 'originali');
  const optimizedDir = join(inputRoot, 'optimized');

  if (!existsSync(inputRoot)) {
    process.stderr.write(`Errore: la cartella "${inputRoot}" non esiste.\n`);
    process.exit(1);
  }

  if (!existsSync(originaliDir)) {
    process.stderr.write(`Errore: la cartella "originali/" non esiste in "${inputRoot}".\n`);
    process.exit(1);
  }

  const allFiles = (await readdir(originaliDir)).filter(isSupportedFile);
  process.stdout.write(`📁 Input:  ${originaliDir}  (${allFiles.length} foto)\n`);
  process.stdout.write('🗑  Svuoto optimized/...\n');

  const { ok, errors, elapsed } = await processDir(originaliDir, optimizedDir);

  const secs = (elapsed / 1000).toFixed(1);
  process.stdout.write(
    `✅ Completato: ${ok} foto ottimizzate${errors > 0 ? `, ${errors} errori` : ''} in ${secs}s\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Esegui i test — devono passare tutti**

```bash
npm test
```

Expected:
```
Test Files  13 passed (13)
     Tests  86 passed (86)
```

(75 test esistenti + 11 nuovi di compress.test.js)

- [ ] **Step 5: Test manuale dello script**

```bash
mkdir -p /tmp/portfolio-test/originali
cp ~/Desktop/qualsiasi-foto.jpg /tmp/portfolio-test/originali/

npm run compress -- --input /tmp/portfolio-test
```

Expected output:
```
📁 Input:  /tmp/portfolio-test/originali  (1 foto)
🗑  Svuoto optimized/...
⚙  [1/1] qualsiasi-foto.jpg → qualsiasi-foto.webp
✅ Completato: 1 foto ottimizzate in 2.3s
```

Verificare che `/tmp/portfolio-test/optimized/qualsiasi-foto.webp` esista e sia visibile.

- [ ] **Step 6: Commit**

```bash
git add scripts/compress.js scripts/compress.test.js
git commit -m "feat: add compress script — WebP 1900px q85, concurrent batches of 4"
```

---

## Verifica finale

```bash
npm test
# Expected: 13 test files, 86 tests passed

npm run compress -- --help
# Expected: stampa usage e termina

npm run compress -- --input /cartella/inesistente
# Expected: "Errore: la cartella..." + exit code 1

npm run compress -- --input /tmp/portfolio-test
# Expected: genera optimized/ con file .webp
```
