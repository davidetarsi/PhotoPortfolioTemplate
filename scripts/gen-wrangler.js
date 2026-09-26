#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { renderWrangler } from '../src/utils/renderWrangler.js';
import { publicOutputs } from '../src/utils/setup.js';

const ESEMPIO = 'wrangler.example.json';
const OUTPUTS = 'infra/outputs.json';
const DESTINAZIONE = 'wrangler.json';

if (!existsSync(OUTPUTS)) {
  console.error(`Manca ${OUTPUTS}. Generalo con:\n  terraform -chdir=infra output -json > ${OUTPUTS}`);
  process.exit(1);
}

// Sensitive outputs (the Turnstile secret) are dropped: they never reach wrangler.json.
const outputs = publicOutputs(JSON.parse(readFileSync(OUTPUTS, 'utf8')));

const esempio = JSON.parse(readFileSync(ESEMPIO, 'utf8'));
writeFileSync(DESTINAZIONE, `${JSON.stringify(renderWrangler(esempio, outputs), null, 2)}\n`);
console.log(`Scritto ${DESTINAZIONE}.`);
