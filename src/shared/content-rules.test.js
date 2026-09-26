import { describe, it, expect } from 'vitest';
import {
  SLUG_RE, RESERVED_SLUGS, TEMPLATE_ROUTES, PHOTO_NAME_RE, MAX_PHOTO_BYTES, slugifyTitle,
  validateSiteShape, validateAlbumsShape, validateManifestShape, validateConfigShape,
} from './content-rules.js';

describe('regex e costanti', () => {
  it('SLUG_RE accetta slug validi e rifiuta gli invalidi', () => {
    expect(SLUG_RE.test('sport')).toBe(true);
    expect(SLUG_RE.test('around-the-world')).toBe(true);
    expect(SLUG_RE.test('-inizio')).toBe(false);
    expect(SLUG_RE.test('Maiuscole')).toBe(false);
    expect(SLUG_RE.test('con spazi')).toBe(false);
    expect(SLUG_RE.test('')).toBe(false);
  });

  it('RESERVED_SLUGS deriva dai primi segmenti di TEMPLATE_ROUTES', () => {
    expect(RESERVED_SLUGS).toEqual(['about', 'admin', 'album', 'api', 'assets', 'index']);
    expect(TEMPLATE_ROUTES.pages).toEqual({ '/about': '/about.html', '/admin': '/admin.html' });
  });

  it('PHOTO_NAME_RE accetta nomi legacy con maiuscole e rifiuta path traversal', () => {
    expect(PHOTO_NAME_RE.test('4x5-crop-IMG_8689-.webp')).toBe(true);
    expect(PHOTO_NAME_RE.test('foto.webp')).toBe(true);
    expect(PHOTO_NAME_RE.test('../evil.webp')).toBe(false);
    expect(PHOTO_NAME_RE.test('foto.jpg')).toBe(false);
    expect(PHOTO_NAME_RE.test('.hidden.webp')).toBe(false);
    expect(PHOTO_NAME_RE.test('a/b.webp')).toBe(false);
  });

  it('MAX_PHOTO_BYTES è 10MB', () => expect(MAX_PHOTO_BYTES).toBe(10 * 1024 * 1024));
});

describe('slugifyTitle', () => {
  it('normalizza titoli in slug validi', () => {
    expect(slugifyTitle('Around the World')).toBe('around-the-world');
    expect(slugifyTitle('  Città & Notte!  ')).toBe('citt-notte');
    expect(slugifyTitle('---')).toBe('');
  });
});

describe('validateSiteShape', () => {
  const ok = { name: 'Davide', bio: '', hero: null, social: {} };
  it('accetta shape valida (hero null e hero valorizzato)', () => {
    expect(validateSiteShape(ok).ok).toBe(true);
    expect(validateSiteShape({ ...ok, hero: { album: 'sport', name: 'a.webp' } }).ok).toBe(true);
  });
  it('rifiuta name vuoto, hero malformato, social non-oggetto', () => {
    expect(validateSiteShape({ ...ok, name: ' ' }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, hero: { album: 'BAD SLUG', name: 'a.webp' } }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, hero: { album: 'sport', name: 'a.jpg' } }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, social: [] }).ok).toBe(false);
    expect(validateSiteShape(null).ok).toBe(false);
  });
});

describe('validateAlbumsShape', () => {
  const album = { slug: 'sport', title: 'Sport', description: '', coverName: null };
  it('accetta lista valida (anche vuota) e coverName string o null', () => {
    expect(validateAlbumsShape({ albums: [] }).ok).toBe(true);
    expect(validateAlbumsShape({ albums: [album] }).ok).toBe(true);
    expect(validateAlbumsShape({ albums: [{ ...album, coverName: 'a.webp' }] }).ok).toBe(true);
  });
  it('accetta uno slug riservato: sul sito vince la rotta del template, la lista resta valida', () => {
    expect(validateAlbumsShape({ albums: [{ ...album, slug: 'admin' }, { ...album, slug: 'index' }] }).ok).toBe(true);
  });
  it('rifiuta duplicati, title vuoto, coverName invalido', () => {
    expect(validateAlbumsShape({ albums: [album, album] }).ok).toBe(false);
    expect(validateAlbumsShape({ albums: [{ ...album, title: '' }] }).ok).toBe(false);
    expect(validateAlbumsShape({ albums: [{ ...album, coverName: 'a.jpg' }] }).ok).toBe(false);
    expect(validateAlbumsShape({}).ok).toBe(false);
    expect(validateAlbumsShape({ albums: 'no' }).ok).toBe(false);
  });
});

describe('validateManifestShape', () => {
  const entry = { name: 'a.webp', width: 100, height: 200 };
  it('accetta array valido (anche vuoto)', () => {
    expect(validateManifestShape([]).ok).toBe(true);
    expect(validateManifestShape([entry]).ok).toBe(true);
  });
  it('rifiuta dimensioni non finite/negative, nomi invalidi o duplicati, non-array', () => {
    expect(validateManifestShape([{ ...entry, width: 0 }]).ok).toBe(false);
    expect(validateManifestShape([{ ...entry, height: NaN }]).ok).toBe(false);
    expect(validateManifestShape([{ ...entry, name: 'a.jpg' }]).ok).toBe(false);
    expect(validateManifestShape([entry, entry]).ok).toBe(false);
    expect(validateManifestShape({}).ok).toBe(false);
  });
  it('accetta capturedAt/uploadedAt opzionali, se presenti devono essere numeri finiti', () => {
    expect(validateManifestShape([{ ...entry, capturedAt: 1700000000000 }]).ok).toBe(true);
    expect(validateManifestShape([{ ...entry, uploadedAt: 1700000000000 }]).ok).toBe(true);
    expect(validateManifestShape([{ ...entry, capturedAt: 1700000000000, uploadedAt: 1700000000001 }]).ok).toBe(true);
    expect(validateManifestShape([entry]).ok).toBe(true); // nessuno dei due: ok comunque (retrocompatibilità)
  });
  it('rifiuta capturedAt/uploadedAt non numerici quando presenti', () => {
    expect(validateManifestShape([{ ...entry, capturedAt: 'ieri' }]).ok).toBe(false);
    expect(validateManifestShape([{ ...entry, uploadedAt: NaN }]).ok).toBe(false);
  });
});

describe('validateConfigShape', () => {
  it('accetta un r2PublicUrl stringa non vuota', () => {
    expect(validateConfigShape({ r2PublicUrl: 'https://pub-x.r2.dev' }).ok).toBe(true);
  });
  it('rifiuta null, stringa vuota/spazi, non-stringa, o oggetto non valido', () => {
    expect(validateConfigShape({ r2PublicUrl: null }).ok).toBe(false);
    expect(validateConfigShape({ r2PublicUrl: '' }).ok).toBe(false);
    expect(validateConfigShape({ r2PublicUrl: '   ' }).ok).toBe(false);
    expect(validateConfigShape({ r2PublicUrl: 42 }).ok).toBe(false);
    expect(validateConfigShape(null).ok).toBe(false);
    expect(validateConfigShape({}).ok).toBe(false);
  });
});
