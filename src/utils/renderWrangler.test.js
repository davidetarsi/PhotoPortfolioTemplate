import { describe, it, expect } from 'vitest';
import { renderWrangler } from './renderWrangler.js';

const EXAMPLE = {
  name: 'il-tuo-portfolio',
  main: 'src/worker.js',
  r2_buckets: [
    { binding: 'BUCKET', bucket_name: 'il-tuo-bucket' },
    { binding: 'MESSAGES_BUCKET', bucket_name: 'il-tuo-bucket-messages' },
  ],
  vars: { ACCESS_TEAM_DOMAIN: 'x', ACCESS_AUD: 'y', R2_PUBLIC_URL: 'z' },
};

const OUTPUTS_WITH_STAGING = {
  project_name: 'mario-portfolio',
  bucket_prod: 'mario-portfolio',
  bucket_staging: 'mario-portfolio-staging',
  messages_bucket_prod: 'mario-portfolio-messages',
  messages_bucket_staging: 'mario-portfolio-messages-staging',
  r2_public_url_prod: 'https://img.mario.com',
  r2_public_url_staging: 'https://pub-bbb.r2.dev',
  access_aud_prod: 'aud-prod',
  access_aud_staging: 'aud-staging',
  access_team_domain: 'mario.cloudflareaccess.com',
};

const OUTPUTS_PROD_ONLY = {
  project_name: 'mario-portfolio',
  bucket_prod: 'mario-portfolio',
  messages_bucket_prod: 'mario-portfolio-messages',
  r2_public_url_prod: 'https://img.mario.com',
  access_aud_prod: 'aud-prod',
  access_team_domain: 'mario.cloudflareaccess.com',
};

describe('renderWrangler', () => {
  it('sostituisce nomi, bucket e vars di produzione', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS_WITH_STAGING);
    expect(r.name).toBe('mario-portfolio');
    expect(r.r2_buckets[0].bucket_name).toBe('mario-portfolio');
    expect(r.vars.R2_PUBLIC_URL).toBe('https://img.mario.com');
    expect(r.vars.ACCESS_AUD).toBe('aud-prod');
    expect(r.vars.ACCESS_TEAM_DOMAIN).toBe('mario.cloudflareaccess.com');
  });

  it('sostituisce anche il blocco staging, con i suoi valori', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS_WITH_STAGING);
    expect(r.env.staging.name).toBe('mario-portfolio-staging');
    expect(r.env.staging.r2_buckets[0].bucket_name).toBe('mario-portfolio-staging');
    expect(r.env.staging.vars.R2_PUBLIC_URL).toBe('https://pub-bbb.r2.dev');
    expect(r.env.staging.vars.ACCESS_AUD).toBe('aud-staging');
  });

  it('non muta l oggetto di esempio ricevuto', () => {
    const copia = structuredClone(EXAMPLE);
    renderWrangler(EXAMPLE, OUTPUTS_WITH_STAGING);
    expect(EXAMPLE).toEqual(copia);
  });

  it('conserva i campi che non dipendono dall infrastruttura', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS_WITH_STAGING);
    expect(r.main).toBe('src/worker.js');
  });

  it('fallisce con messaggio parlante se manca una chiave', () => {
    const { access_aud_prod, ...incompleti } = OUTPUTS_WITH_STAGING;
    expect(() => renderWrangler(EXAMPLE, incompleti)).toThrow(/access_aud_prod/);
  });

  it('removes env entirely when all staging outputs are absent', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS_PROD_ONLY);
    expect(r).not.toHaveProperty('env');
  });

  it('builds a complete staging block when all three staging outputs exist', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS_WITH_STAGING);
    expect(r.env.staging).toEqual({
      name: 'mario-portfolio-staging',
      r2_buckets: [
        { binding: 'BUCKET', bucket_name: 'mario-portfolio-staging' },
        { binding: 'MESSAGES_BUCKET', bucket_name: 'mario-portfolio-messages-staging' },
      ],
      vars: {
        ACCESS_TEAM_DOMAIN: 'mario.cloudflareaccess.com',
        ACCESS_AUD: 'aud-staging',
        R2_PUBLIC_URL: 'https://pub-bbb.r2.dev',
        TURNSTILE_SITEKEY: '',
      },
    });
  });

  it('rejects a partial staging output group', () => {
    expect(() => renderWrangler(EXAMPLE, {
      ...OUTPUTS_PROD_ONLY,
      bucket_staging: 'mario-portfolio-staging',
    })).toThrow(/bucket_staging, r2_public_url_staging, access_aud_staging, messages_bucket_staging/);
  });

  it('turnstile spento: sitekey vuota, non un errore', () => {
    const { turnstile_sitekey: _, ...senzaStaging } = OUTPUTS_PROD_ONLY;
    const rProd = renderWrangler(EXAMPLE, senzaStaging);
    expect(rProd.vars.TURNSTILE_SITEKEY).toBe('');

    const { turnstile_sitekey: __, ...senza } = OUTPUTS_WITH_STAGING;
    const rStaging = renderWrangler(EXAMPLE, senza);
    expect(rStaging.vars.TURNSTILE_SITEKEY).toBe('');
    expect(rStaging.env.staging.vars.TURNSTILE_SITEKEY).toBe('');
  });

  it('lega i messaggi al bucket privato, separato da quello delle foto', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS_PROD_ONLY);
    expect(r.r2_buckets).toEqual([
      { binding: 'BUCKET', bucket_name: 'mario-portfolio' },
      { binding: 'MESSAGES_BUCKET', bucket_name: 'mario-portfolio-messages' },
    ]);
  });

  it('fallisce se manca il bucket dei messaggi negli output', () => {
    const { messages_bucket_prod: _, ...senza } = OUTPUTS_PROD_ONLY;
    expect(() => renderWrangler(EXAMPLE, senza)).toThrow(/messages_bucket_prod/);
  });

  it('fallisce se wrangler.example.json non dichiara i due binding', () => {
    const vecchio = { ...EXAMPLE, r2_buckets: [{ binding: 'BUCKET', bucket_name: 'x' }] };
    expect(() => renderWrangler(vecchio, OUTPUTS_PROD_ONLY)).toThrow(/MESSAGES_BUCKET/);
  });

  it('collega il dominio proprio al Worker e spegne workers.dev, senza staging', () => {
    const r = renderWrangler(EXAMPLE, { ...OUTPUTS_PROD_ONLY, prod_hostname: 'mario.com' });
    expect(r.routes).toEqual([{ pattern: 'mario.com', custom_domain: true }]);
    expect(r.workers_dev).toBe(false);
    expect(r.preview_urls).toBe(false);
  });

  it('con lo staging collega il dominio ma lascia workers.dev, dove vive l anteprima', () => {
    const r = renderWrangler(EXAMPLE, { ...OUTPUTS_WITH_STAGING, prod_hostname: 'mario.com' });
    expect(r.routes).toEqual([{ pattern: 'mario.com', custom_domain: true }]);
    expect(r).not.toHaveProperty('workers_dev');
    expect(r).not.toHaveProperty('preview_urls');
  });

  it('su un indirizzo workers.dev, o senza prod_hostname, non tocca routes né workers.dev', () => {
    for (const outputs of [{ ...OUTPUTS_PROD_ONLY, prod_hostname: 'mario.acct.workers.dev' }, OUTPUTS_PROD_ONLY]) {
      const r = renderWrangler(EXAMPLE, outputs);
      expect(r).not.toHaveProperty('routes');
      expect(r).not.toHaveProperty('workers_dev');
      expect(r).not.toHaveProperty('preview_urls');
    }
  });

  it('ricalcola routes e workers_dev a ogni sync, senza tenere valori vecchi', () => {
    const stale = { ...EXAMPLE, routes: [{ pattern: 'old.com', custom_domain: true }], workers_dev: false, preview_urls: false };
    const r = renderWrangler(stale, OUTPUTS_PROD_ONLY);
    expect(r).not.toHaveProperty('routes');
    expect(r).not.toHaveProperty('workers_dev');
    expect(r).not.toHaveProperty('preview_urls');
  });
});
