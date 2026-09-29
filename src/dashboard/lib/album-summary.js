import { texts } from '../../../config/texts.config.js';
import { formatText } from '../../utils/formatText.js';

const t = texts.admin.albums;

/** A compact gallery summary for a manifest. */
export function summarizeManifest(manifest = []) {
  return { photoCount: manifest.length, firstPhoto: manifest[0]?.name ?? null };
}

/** How many photos, in words. */
export function photoCount(n) {
  if (!n) return t.photoCountNone;
  return n === 1 ? t.photoCountOne : formatText(t.photoCountMany, { n });
}
