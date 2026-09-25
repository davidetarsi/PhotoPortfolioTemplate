# Separate public photo and private contact buckets — Design

**Date:** 2026-09-25
**Status:** proposed; awaiting review of this written specification

## Purpose and scope

People adopting PhotoPortfolioTemplate should be able to display photos publicly
without exposing contact messages through the same R2 public URL. Davide's existing
PhotoPortfolio must be migrated without losing messages or disrupting photos.

The agreed direction is one public photo bucket and one private contact-message
bucket per enabled environment. A short contact-form maintenance window during
the live cutover is acceptable. Staging remains opt-in. The photo custom-domain
decision remains open and is not a prerequisite for this separation.

## Verified starting point

- `infra/r2.tf` creates a production photo bucket and, when `enable_staging` is
  true, a staging photo bucket. It configures public `r2.dev` access and an
  optional production custom domain for these photo buckets.
- `wrangler.example.json` and `src/utils/renderWrangler.js` configure one R2
  binding, `BUCKET`, per environment.
- `src/worker/contact-routes.js` writes `_messages/*.json` to `env.BUCKET`;
  `src/worker/admin-routes.js` lists, reads and deletes those objects from the
  same binding. `BUCKET` also holds photos and site data.
- The template is upstream of Davide's separate personal site. Terraform state
  for the already-live personal Cloudflare resources has not been imported;
  that work (7B) is deferred.

Cloudflare says R2 buckets are private by default, public `r2.dev`/custom-domain
access must be enabled explicitly, and Workers can access buckets through R2
bindings. `r2.dev` is intended for non-production use; that production photo
domain question stays open.

Sources: [public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/),
[Workers bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/).

## Chosen approach and alternatives

Add private message buckets to the template's Terraform and a dedicated Worker
binding. For Davide's live site, create the message buckets separately before
deployment and import them into Terraform only when 7B is addressed.

We are not bringing 7B forward solely to create these buckets: applying the
template's Terraform to an unimported live account could try to recreate or
alter existing photo, Access or Turnstile resources. Keeping `_messages/` in a
public photo bucket, even behind an obscure prefix or Worker route, is not a
privacy boundary because the public R2 URL can still serve a known object key.

## Target architecture

| Environment | Photo bucket | Message bucket | Public R2 URL |
| --- | --- | --- | --- |
| Production | `${project_name}` | `${project_name}-messages` | Photos only |
| Staging, when enabled | `${project_name}-staging` | `${project_name}-messages-staging` | Photos only |

`enable_staging = false` creates exactly the two production buckets;
`enable_staging = true` creates all four. Neither message bucket receives a
managed `r2.dev` domain or a custom domain. Terraform exposes their names as
outputs for Wrangler generation, but no public message URL.

The existing `BUCKET` binding remains for photos and site data. A new
`MESSAGES_BUCKET` binding points to the private message bucket in each enabled
environment. The contact endpoint writes there only after validation and
Turnstile verification. The Access-protected admin message endpoints list,
read and delete there. Photo and site-data paths keep using `BUCKET`; their
keys and public URLs do not change. The `_messages/` key format remains stable
so existing dashboard IDs survive migration.

If `MESSAGES_BUCKET` is absent or storage fails, contact submission must fail
closed with a generic 5xx response and must not report success or fall back to
`BUCKET`. Notification failure after a successful private write retains the
existing non-fatal behavior. Public routes must never expose message objects.
No message body, sender email, credentials or migration payloads go to logs.

## Template delivery and documentation

- Extend `infra/r2.tf`, outputs and Terraform tests with the two private
  buckets and the `enable_staging` cardinality. Keep all public-domain
  resources attached only to photo buckets.
- Extend `wrangler.example.json`, `renderWrangler` and tests so generated
  production/staging configurations contain both bindings. Partial or missing
  required message-bucket outputs are errors, not silent fallbacks.
- Change contact/admin message access and tests to use `MESSAGES_BUCKET`.
  Add tests proving a contact submission never writes to `BUCKET`, and admin
  message operations never read or delete from it.
- Update the README as the entry point, linking the Cloudflare runbook,
  upgrade/migration instructions and staging guide. State the exact bucket
  counts and the privacy/public-access boundary. Record that the photo custom
  domain remains undecided; do not present `r2.dev` as production-ready.
- Existing installations need an explicit upgrade warning: provision and bind
  private storage before deploying code that requires `MESSAGES_BUCKET`.

## Davide's live-site migration

This is a separate downstream rollout after the generic template change is
tested. It does not run `terraform apply` against the live personal account.

1. Inventory only `_messages/` keys in the existing production and staging
   photo buckets; capture counts and per-object verification metadata without
   printing or exporting message contents. Confirm exact bucket names and
   current public-access settings at rollout time.
2. Create one private message bucket for each existing environment. Verify
   that neither has `r2.dev` nor a custom domain. Add the corresponding
   `MESSAGES_BUCKET` bindings to the personal Worker's production and staging
   configurations; do not change the photo bindings.
3. Test staging first. Put the form into an explicit maintenance state during
   cutover: the UI must explain temporary unavailability and `/api/contact`
   must reject submissions without acknowledging them as stored. Copy existing
   `_messages/` objects to the private bucket, preserving keys and bytes.
   Verify every copied key and payload before switching the admin read path.
4. Deploy the new Worker, check a neutral canary submission, admin list/read/
   delete and photo delivery, then end maintenance. Repeat for production
   after staging passes. If the gate fails, keep or restore the old binding
   configuration without deleting either copy; keep the form in maintenance
   until the storage path is known to work.
5. After both environments pass and a final inventory shows no missed legacy
   objects, delete only the verified `_messages/` objects from the *old photo
   buckets*. Never delete photo/site-data objects or entire buckets. Recheck
   that an old direct public object URL no longer serves a message. A past
   download cannot be revoked; the migration prevents future reads through
   those bucket objects, not historical access.

The migration mechanism must be idempotent, support paginated listings, and
never overwrite a different object at the same destination key. Its exact
operator commands and rollback checkpoints belong in the implementation plan
and runbook, after inspecting live object counts and available Cloudflare
access. No real message payload is used in automated tests.

## Acceptance and deferred decisions

The template passes unit/build/Terraform checks with staging both off and on.
In each case the number of photo and private message buckets is correct, no
message bucket has public-domain resources, and generated Wrangler bindings
match the selected environments. The form fails closed without private storage;
existing photo routes still work. For Davide's rollout, staging and production
each pass a canary form/dashboard test and legacy-message verification before
old objects are removed.

Still deferred: importing existing personal resources into Terraform (7B),
the final 7C test, point 9, and whether/when to give public production photos
a custom domain. This work must not silently resolve those decisions.
