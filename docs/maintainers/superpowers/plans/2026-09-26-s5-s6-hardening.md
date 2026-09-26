# S5 + S6 — Small hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** Unauthenticated requests can no longer force repeated downloads of the Access signing keys (S5); the dashboard shows every message even beyond R2's 1000-object page (S6); rate limiting and HSTS are documented (S6).

**Architecture:** Two small Worker changes with tests; two documentation paragraphs.

**Tech Stack:** JavaScript ES modules, Vitest 4 (node environment for Worker tests).

**Spec:** audit findings S5 and S6 in `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`. Ruling (maintainer, 2026-09-26): the contact rate limit is documented as a dashboard rule instead of managed by Terraform, because a Terraform ruleset needs the zone ID as a new required variable, which would add a setup step against the simplification goal.

**Base:** branch `feat/s2-private-messages` (S2 done; the message routes use `MESSAGES_BUCKET`). Implementation branch: `feat/s5-s6-hardening`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- Never commit `custom/`, `wrangler.json`, `dist/`, `.superpowers/`. Do not run `npm install`.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy.

---

### Task 1: At most one key download a minute for unknown key ids (S5)

**Files:** Modify `src/worker/access-jwt.js`, `src/worker/access-jwt.test.js`.

- [ ] **Step 1: Tests.** In `src/worker/access-jwt.test.js`, replace the whole test `it('kid sconosciuto → refresh JWKS; TTL scaduto → refresh', …)` (from its `it(` line to its closing `});`) with:

```js
  it('kid sconosciuto → refresh JWKS, se l ultimo download ha almeno un minuto; TTL scaduto → refresh', async () => {
    let calls = 0;
    const rotating = await makeJwtTestKit({ kid: 'nuova-chiave' });
    const LATER = NOW + 60_000;
    let now = NOW;
    const d = {
      now: () => now,
      fetchJwks: async () => { calls++; return calls === 1 ? kit.fetchJwks() : rotating.fetchJwks(); },
    };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d); // popola cache (kit)
    now = LATER;
    const res = await verifyAccessJwt(reqWith(await rotating.signToken(basePayload())), ENV, d);
    expect(res.ok).toBe(true);
    expect(calls).toBe(2); // refresh su kid sconosciuto, un minuto dopo

    _resetJwksCache();
    let calls2 = 0;
    const d2 = { fetchJwks: async () => { calls2++; return kit.fetchJwks(); }, now: () => NOW };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d2);
    const d3 = { ...d2, now: () => NOW + 3_600_001 }; // oltre TTL 1h
    const late = { ...basePayload(), exp: Math.floor((NOW + 3_600_001) / 1000) + 3600, iat: Math.floor((NOW + 3_600_001) / 1000) };
    await verifyAccessJwt(reqWith(await kit.signToken(late)), ENV, d3);
    expect(calls2).toBe(2); // refresh su TTL
  });

  it('kid sconosciuti ripetuti: al massimo un download al minuto', async () => {
    let calls = 0;
    const d = { fetchJwks: async () => { calls++; return kit.fetchJwks(); }, now: () => NOW };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d); // popola cache
    for (let i = 0; i < 5; i++) {
      const stranger = await makeJwtTestKit({ kid: `ignota-${i}` });
      expect((await verifyAccessJwt(reqWith(await stranger.signToken(basePayload())), ENV, d)).ok).toBe(false);
    }
    expect(calls).toBe(1);
  });

  it('un token senza kid non scarica le chiavi', async () => {
    let calls = 0;
    const d = { fetchJwks: async () => { calls++; return kit.fetchJwks(); }, now: () => NOW };
    const [, payload, signature] = (await kit.signToken(basePayload())).split('.');
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect((await verifyAccessJwt(reqWith(`${header}.${payload}.${signature}`), ENV, d)).ok).toBe(false);
    expect(calls).toBe(0);
  });
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/worker/access-jwt.test.js` → FAIL (the repeated-kid test counts 6 downloads; the no-kid test counts 1).

- [ ] **Step 3: Implement** in `src/worker/access-jwt.js`. After the line `const JWKS_TTL_MS = 3_600_000; // 1h` add:

```js
// An unknown kid may mean a key rotation, so it triggers a download — but at most one a
// minute: otherwise anyone could force a fetch to the team domain with every forged token.
const UNKNOWN_KID_REFETCH_MS = 60_000;
```

Replace the whole function

```js
async function getKey(kid, teamDomain, fetchJwks, now) {
  const stale = !jwksCache || jwksCache.teamDomain !== teamDomain || now - jwksCache.fetchedAt > JWKS_TTL_MS;
  if (stale || !jwksCache.keys.has(kid)) {
    const keys = await importJwks(await fetchJwks(teamDomain));
    jwksCache = { teamDomain, fetchedAt: now, keys };
  }
  return jwksCache.keys.get(kid) ?? null;
}
```

with

```js
async function getKey(kid, teamDomain, fetchJwks, now) {
  const stale = !jwksCache || jwksCache.teamDomain !== teamDomain || now - jwksCache.fetchedAt > JWKS_TTL_MS;
  const unknownKid = !stale && !jwksCache.keys.has(kid);
  if (stale || (unknownKid && now - jwksCache.fetchedAt >= UNKNOWN_KID_REFETCH_MS)) {
    const keys = await importJwks(await fetchJwks(teamDomain));
    jwksCache = { teamDomain, fetchedAt: now, keys };
  }
  return jwksCache.keys.get(kid) ?? null;
}
```

In `verifyAccessJwt`, replace `    if (header.alg !== 'RS256') return { ok: false };` with:

```js
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false };
```

- [ ] **Step 4: Run to verify pass.** `npm test -- src/worker/access-jwt.test.js` → PASS; `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/worker/access-jwt.js src/worker/access-jwt.test.js
git commit -F - <<'EOF'
fix(worker): limit Access key downloads for unknown key ids

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: The dashboard lists every message, across R2 pages (S6)

**Files:** Modify `src/worker/admin-routes.js`, `src/worker/admin-routes.test.js`.

- [ ] **Step 1: Test.** In `src/worker/admin-routes.test.js`, inside `describe('messaggi', …)`, add after the test `'elenca i messaggi del bucket privato, dal piu recente'`:

```js
  it('elenca anche oltre i 1000 oggetti di una pagina di R2', async () => {
    const many = {};
    for (let i = 0; i < 1001; i++) {
      many[`_messages/2026-01-01T00-00-00-${String(i).padStart(4, '0')}Z-aaa.json`] = { ...M1, receivedAt: i };
    }
    const { messages } = await (await call(makeEnv({}, many), 'GET', '/api/admin/messages')).json();
    expect(messages).toHaveLength(1001);
    expect(messages[0].receivedAt).toBe(1000);
  });
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/worker/admin-routes.test.js` → FAIL (1000 instead of 1001).

- [ ] **Step 3: Implement.** In `src/worker/admin-routes.js`, replace

```js
    const { objects } = await env.MESSAGES_BUCKET.list({ prefix: MESSAGES_PREFIX });
    const messages = [];
```

with

```js
    // list() returns at most 1000 keys per page: follow the cursor to the end.
    const objects = [];
    let cursor;
    do {
      const page = await env.MESSAGES_BUCKET.list({ prefix: MESSAGES_PREFIX, cursor });
      objects.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    const messages = [];
```

- [ ] **Step 4: Run to verify pass.** `npm test -- src/worker/admin-routes.test.js` → PASS; `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/worker/admin-routes.js src/worker/admin-routes.test.js
git commit -F - <<'EOF'
fix(worker): list every message across R2 pages

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: Document rate limiting and HSTS (S6)

**Files:** Modify `docs/runbook-cloudflare.md`, `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`.

- [ ] **Step 1: Rate limiting.** In `docs/runbook-cloudflare.md`, directly after the paragraph that starts `**If you turn Turnstile off**`, add (one empty line before and after):

```markdown
**Rate limiting, with or without Turnstile.** The free plan includes one rate limiting rule. Cloudflare dashboard → your domain → **Security → WAF → Rate limiting rules → Create rule**: match *URI Path* equals `/api/contact` and *Request Method* equals `POST`, count per IP, a low limit such as 3 requests per 10 seconds, action **Block**. It applies only on your own domain, not on the `workers.dev` address.
```

- [ ] **Step 2: HSTS.** In `docs/runbook-cloudflare.md`, directly after the line that starts `- **Production domain** (optional on first deploy, required before going live).`, add this line:

```markdown
- **HTTPS on every subdomain, if you use the bare domain.** The site sends `Strict-Transport-Security` with `includeSubDomains`: once a browser has visited `mario.com`, it refuses plain HTTP on every `*.mario.com` for a year. If some subdomain still serves HTTP, put the portfolio on a subdomain such as `portfolio.mario.com` instead.
```

- [ ] **Step 3: Audit status.** In `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`, replace `Restano aperti: S4` with `S5 e S6 corretti sul branch `feat/s5-s6-hardening` (piano `docs/maintainers/superpowers/plans/2026-09-26-s5-s6-hardening.md`; limite di frequenza documentato come regola della dashboard). Restano aperti: S4`, and in the same line delete the trailing `, S5, S6` (so it ends with the S4 description).

- [ ] **Step 4: Check and commit.** `node /srv/claude/workspaces/qa-audit/check-links.mjs docs/runbook-cloudflare.md` → `0 broken`; `npm test` → PASS.

```bash
git add docs/runbook-cloudflare.md docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md
git commit -F - <<'EOF'
docs: rate limiting rule and HSTS note for the contact form and domain

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```
