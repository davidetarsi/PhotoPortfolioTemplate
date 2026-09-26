#!/usr/bin/env node
// npm run setup:secrets: after the first deploy, gives the Worker the Turnstile secret key
// straight from Terraform, through a pipe: it is never written to a file.
import { spawnSync } from 'node:child_process';

const secret = spawnSync('terraform', ['-chdir=infra', 'output', '-raw', 'turnstile_secret'], { encoding: 'utf8' });
if (secret.status !== 0) {
  console.error(secret.stderr || 'terraform output failed: run npm run setup first.');
  process.exit(1);
}
if (!secret.stdout.trim()) {
  console.log('Turnstile is off (enable_turnstile = false): there is no secret to set.');
  process.exit(0);
}

const put = spawnSync('npx', ['wrangler', 'versions', 'secret', 'put', 'TURNSTILE_SECRET'], {
  input: secret.stdout.trim(),
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (put.status !== 0) process.exit(put.status ?? 1);

console.log(`
TURNSTILE_SECRET is on a new Worker version: promote it from the Worker's Deployments tab, or push a commit.
Optional, a push notification for each new message:
  npx wrangler versions secret put CONTACT_NOTIFY_URL`);
