// One-shot: transforms build-time configs into runtime JSON and uploads to R2.
// Usage: npm run migrate            → uploads _site/site.json and _data/albums.json
//        npm run migrate -- --dry-run → prints JSON without uploading
//        npm run migrate -- --force  → overwrites existing data on R2
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';
import { siteConfig } from '../config/site.config.js';
import { albums } from '../config/albums.config.js';
import { decideMigration } from '../src/utils/decideMigration.js';
import { normalizeLinks } from '../src/shared/site-links.js';

/**
 * Transforms album config to runtime format for R2 storage.
 * @param {Array<Object>} legacyAlbums - Album configurations from config file.
 * @returns {{albums: Array<Object>}} Runtime albums structure.
 */
export function albumsToRuntime(legacyAlbums) {
  return {
    albums: legacyAlbums.map(a => ({
      slug: a.slug,
      title: a.title,
      description: a.description ?? '',
      // `||` not `??`: the seed uses empty string for "no cover", but "" is not
      // a valid coverName for validateAlbumsShape, which accepts only null or a
      // filename. With `??`, the empty string would survive and the site would
      // reject its own just-migrated data.
      coverName: a.coverName || null,
    })),
  };
}

/**
 * Transforms site config to runtime format for R2 storage.
 * Links come from `links`, or are converted from an old `social` object.
 * @param {Object} cfg - Site configuration object.
 * @returns {Object} Runtime site structure with name, bio, hero, and links.
 */
export function siteToRuntime(cfg) {
  return {
    name: cfg.name,
    bio: cfg.bio ?? '',
    hero: cfg.heroImage ?? null,
    links: normalizeLinks(cfg),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const siteJson = JSON.stringify(siteToRuntime(siteConfig), null, 2);
  const albumsJson = JSON.stringify(albumsToRuntime(albums), null, 2);

  process.stdout.write(`_site/site.json:\n${siteJson}\n\n_data/albums.json:\n${albumsJson}\n\n`);
  if (dryRun) {
    process.stdout.write('Dry-run: no upload.\n');
    return;
  }

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    process.stderr.write('Missing R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME required in .env).\n');
    process.exit(1);
  }
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  const force = process.argv.includes('--force');
  const chiavi = ['_site/site.json', '_data/albums.json'];

  const esistenti = [];
  for (const key of chiavi) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
      esistenti.push(key);
    } catch (err) {
      // 404/NotFound = key doesn't exist, normal on first run.
      // Any other error (permissions, network, wrong bucket) must not be mistaken
      // for "doesn't exist": better to stop than overwrite blindly.
      const code = err?.$metadata?.httpStatusCode;
      if (code !== 404 && err?.name !== 'NotFound') throw err;
    }
  }

  const decisione = decideMigration(esistenti, force);
  if (decisione.messaggio) process.stdout.write(`${decisione.messaggio}\n`);
  if (!decisione.procedi) process.exit(1);

  for (const [key, body] of [['_site/site.json', siteJson], ['_data/albums.json', albumsJson]]) {
    await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: body, ContentType: 'application/json' }));
    process.stdout.write(`✓ uploaded ${key}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
