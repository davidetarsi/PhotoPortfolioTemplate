import { describe, it, expect } from 'vitest';
import { renderWrangler } from './renderWrangler.js';

const EXAMPLE = {
  name: 'il-tuo-portfolio',
  main: 'src/worker.js',
  r2_buckets: [{ binding: 'BUCKET', bucket_name: 'il-tuo-bucket' }],
  vars: { ACCESS_TEAM_DOMAIN: 'x', ACCESS_AUD: 'y', R2_PUBLIC_URL: 'z' },
};

const OUTPUTS_WITH_STAGING = {
  project_name: 'mario-portfolio',
  bucket_prod: 'mario-portfolio',
  bucket_staging: 'mario-portfolio-staging',
  r2_public_url_prod: 'https://img.mario.com',
  r2_public_url_staging: 'https://pub-bbb.r2.dev',
  access_aud_prod: 'aud-prod',
  access_aud_staging: 'aud-staging',
  access_team_domain: 'mario.cloudflareaccess.com',
};

const OUTPUTS_PROD_ONLY = {
  project_name: 'mario-portfolio',
  bucket_prod: 'mario-portfolio',
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
      r2_buckets: [{ binding: 'BUCKET', bucket_name: 'mario-portfolio-staging' }],
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
    })).toThrow(/bucket_staging, r2_public_url_staging, access_aud_staging/);
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
});
