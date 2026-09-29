import { describe, it, expect } from 'vitest';
import { buildHeaders } from './buildHeaders.js';

const CONFIG = {
  vars: { R2_PUBLIC_URL: 'https://pub-aaa.r2.dev' },
  env: { staging: { vars: { R2_PUBLIC_URL: 'https://pub-bbb.r2.dev' } } },
};

describe('buildHeaders', () => {
  it('autorizza entrambe le origini R2 in img-src e connect-src', () => {
    const h = buildHeaders(CONFIG);
    expect(h).toContain('https://pub-aaa.r2.dev');
    expect(h).toContain('https://pub-bbb.r2.dev');
    const csp = h.split('\n').find(r => r.includes('Content-Security-Policy'));
    expect(csp).toMatch(/img-src[^;]*pub-aaa/);
    expect(csp).toMatch(/connect-src[^;]*pub-bbb/);
  });

  it('non ripete l origine quando prod e staging coincidono', () => {
    const h = buildHeaders({
      vars: { R2_PUBLIC_URL: 'https://pub-aaa.r2.dev' },
      env: { staging: { vars: { R2_PUBLIC_URL: 'https://pub-aaa.r2.dev' } } },
    });
    const csp = h.split('\n').find(r => r.includes('Content-Security-Policy'));
    expect(csp.match(/pub-aaa\.r2\.dev/g)).toHaveLength(2); // una in img-src, una in connect-src
  });

  it('mantiene le direttive di irrigidimento', () => {
    const h = buildHeaders(CONFIG);
    expect(h).toContain("frame-ancestors 'self'");
    expect(h).toContain('X-Frame-Options: SAMEORIGIN');
    for (const path of ['/admin', '/admin/', '/admin.html', '/admin/*']) {
      expect(h).toContain(`${path}\n  Content-Security-Policy: frame-ancestors 'none'\n  ! X-Frame-Options\n  X-Frame-Options: DENY`);
    }
    expect(h).toContain("object-src 'none'");
    expect(h).toContain('X-Content-Type-Options: nosniff');
    expect(h).toContain('Strict-Transport-Security');
  });

  it('permette WebAssembly (encoder WebP di Safari) ma non eval', () => {
    const csp = buildHeaders(CONFIG).split('\n').find(r => r.includes('Content-Security-Policy'));
    expect(csp).toMatch(/script-src[^;]*'wasm-unsafe-eval'/);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('con Turnstile configurato autorizza il suo script, la sua connessione e il suo iframe', () => {
    const h = buildHeaders({ ...CONFIG, vars: { ...CONFIG.vars, TURNSTILE_SITEKEY: '0x4AAA' } });
    const csp = h.split('\n').find(r => r.includes('Content-Security-Policy'));
    expect(csp).toMatch(/script-src[^;]*challenges\.cloudflare\.com/);
    expect(csp).toMatch(/connect-src[^;]*challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src[^;]*challenges\.cloudflare\.com/);
  });

  it('senza Turnstile non nomina challenges.cloudflare.com', () => {
    // Autorizzare un dominio che non si usa allarga la policy senza
    // motivo: chi tiene Turnstile spento non deve pagarne il prezzo.
    const h = buildHeaders(CONFIG);
    expect(h).not.toContain('challenges.cloudflare.com');
    expect(h).not.toContain('frame-src');
  });

  it('funziona anche senza blocco staging', () => {
    const h = buildHeaders({ vars: { R2_PUBLIC_URL: 'https://pub-aaa.r2.dev' } });
    expect(h).toContain('https://pub-aaa.r2.dev');
  });

  it('fallisce con messaggio parlante se manca R2_PUBLIC_URL', () => {
    expect(() => buildHeaders({ vars: {} })).toThrow(/R2_PUBLIC_URL/);
  });

  it('rifiuta un segnaposto non sostituito', () => {
    expect(() => buildHeaders({ vars: { R2_PUBLIC_URL: 'https://pub-xxxxxxxx.r2.dev' } }))
      .toThrow(/placeholder/);
  });

  it('con allowPlaceholders accetta il segnaposto, per verificare che il template compili', () => {
    const h = buildHeaders(
      { vars: { R2_PUBLIC_URL: 'https://pub-xxxxxxxx.r2.dev' } },
      { allowPlaceholders: true },
    );
    expect(h).toContain('Content-Security-Policy');
  });
});
