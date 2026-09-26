#!/usr/bin/env node
// npm run setup: from infra/terraform.tfvars to a ready wrangler.json in one command.
// Runs terraform init and apply (apply shows the plan and asks for confirmation), then
// writes wrangler.json from the outputs. Secrets never reach a file: see setup:secrets.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { renderWrangler } from '../src/utils/renderWrangler.js';
import { publicOutputs, setupProblems } from '../src/utils/setup.js';

const hasCommand = command => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0;
const problems = setupProblems({ env: process.env, exists: existsSync, hasCommand });
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exit(1);
}

for (const args of [['init', '-input=false'], ['apply']]) {
  const step = spawnSync('terraform', ['-chdir=infra', ...args], { stdio: 'inherit' });
  if (step.status !== 0) process.exit(step.status ?? 1);
}

const raw = spawnSync('terraform', ['-chdir=infra', 'output', '-json'], { encoding: 'utf8' });
if (raw.status !== 0) {
  console.error(raw.stderr);
  process.exit(1);
}
const outputs = publicOutputs(JSON.parse(raw.stdout));
const example = JSON.parse(readFileSync('wrangler.example.json', 'utf8'));
writeFileSync('wrangler.json', `${JSON.stringify(renderWrangler(example, outputs), null, 2)}\n`);

console.log(`
wrangler.json is ready. Next:
  1. git add wrangler.json && git commit -m "chore: my Cloudflare configuration" && git push
  2. Connect the repository to Cloudflare (README, step 3) and wait for the first deploy.
  3. npm run setup:secrets`);
