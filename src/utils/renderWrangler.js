const REQUIRED_PRODUCTION_KEYS = [
  'project_name',
  'bucket_prod',
  'messages_bucket_prod',
  'r2_public_url_prod',
  'access_aud_prod',
  'access_team_domain',
];

const STAGING_KEYS = [
  'bucket_staging',
  'r2_public_url_staging',
  'access_aud_staging',
  'messages_bucket_staging',
];

/**
 * Renders wrangler.json from Terraform outputs (or manual values following the runbook).
 * Pure function: does not mutate the input object.
 *
 * @param {object} example - The content of wrangler.example.json template.
 * @param {Record<string,string>} outputs - Terraform outputs from infra/outputs.tf.
 * @returns {object} Complete wrangler.json configuration ready to write.
 */
export function renderWrangler(example, outputs) {
  const mancanti = REQUIRED_PRODUCTION_KEYS.filter(k => !outputs[k]);
  if (mancanti.length > 0) {
    throw new Error(`Valori mancanti negli output: ${mancanti.join(', ')}`);
  }

  const stagingValues = STAGING_KEYS.filter(key => outputs[key]);
  if (stagingValues.length > 0 && stagingValues.length < STAGING_KEYS.length) {
    throw new Error(`Staging outputs must be all present or all empty: ${STAGING_KEYS.join(', ')}`);
  }

  const out = structuredClone(example);

  out.name = outputs.project_name;
  const photos = out.r2_buckets?.find(b => b.binding === 'BUCKET');
  const messages = out.r2_buckets?.find(b => b.binding === 'MESSAGES_BUCKET');
  if (!photos || !messages) {
    throw new Error('wrangler.example.json: r2_buckets must declare both BUCKET and MESSAGES_BUCKET.');
  }
  photos.bucket_name = outputs.bucket_prod;
  messages.bucket_name = outputs.messages_bucket_prod;
  out.vars.R2_PUBLIC_URL = outputs.r2_public_url_prod;
  out.vars.ACCESS_AUD = outputs.access_aud_prod;
  out.vars.ACCESS_TEAM_DOMAIN = outputs.access_team_domain;
  out.vars.TURNSTILE_SITEKEY = outputs.turnstile_sitekey ?? '';

  if (stagingValues.length === STAGING_KEYS.length) {
    out.env = out.env ?? {};
    out.env.staging = {
      name: `${outputs.project_name}-staging`,
      r2_buckets: [
        { binding: 'BUCKET', bucket_name: outputs.bucket_staging },
        { binding: 'MESSAGES_BUCKET', bucket_name: outputs.messages_bucket_staging },
      ],
      vars: {
        ACCESS_TEAM_DOMAIN: outputs.access_team_domain,
        ACCESS_AUD: outputs.access_aud_staging,
        R2_PUBLIC_URL: outputs.r2_public_url_staging,
        TURNSTILE_SITEKEY: outputs.turnstile_sitekey ?? '',
      },
    };
  } else if (out.env) {
    delete out.env.staging;
    if (Object.keys(out.env).length === 0) delete out.env;
  }

  return out;
}
