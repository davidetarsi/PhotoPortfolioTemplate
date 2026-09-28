/**
 * The text fields of the Site screen: where each one lives in site.json, how it is read
 * and written, and what it accepts. Plain JavaScript (no React).
 */
import { EDITABLE_TEXT_KEYS, MAX_TEXT_LENGTH } from '../../shared/content-rules.js';

/** The template's own text for a key of EDITABLE_TEXT_KEYS ('about.form.successMessage'). */
export function defaultText(key, texts) {
  return key.split('.').reduce((node, part) => node?.[part], texts) ?? '';
}

const identity = [
  { id: 'site.name', group: 'who', label: 'nameLabel', required: true, multiline: false,
    read: site => site.name, write: (site, value) => ({ ...site, name: value }) },
  { id: 'site.bio', group: 'who', label: 'bioLabel', required: false, multiline: true,
    read: site => site.bio, write: (site, value) => ({ ...site, bio: value }) },
];

const PAGE_TEXTS = {
  'landing.albumsSectionHeading': { group: 'home', label: 'albumsHeadingLabel', multiline: false },
  'about.heading': { group: 'contact', label: 'aboutHeadingLabel', multiline: false },
  'about.body': { group: 'contact', label: 'aboutBodyLabel', multiline: true },
  'about.form.successMessage': { group: 'contact', label: 'successMessageLabel', multiline: true },
};

/**
 * Every text field, in the order of the screen. A page text shows the template's text until
 * it is changed; `reset` gives it back (the key leaves site.texts).
 * @param {object} texts - config/texts.config.js.
 * @returns {Array<{id: string, group: string, label: string, required: boolean, multiline: boolean,
 *   textKey?: string, read: Function, write: Function, reset?: Function, isDefault?: Function}>}
 */
export function textFields(texts) {
  const pageTexts = EDITABLE_TEXT_KEYS.map(key => ({
    id: `texts.${key}`, textKey: key, required: false, ...PAGE_TEXTS[key],
    read: site => site.texts[key] ?? defaultText(key, texts),
    write: (site, value) => ({ ...site, texts: { ...site.texts, [key]: value } }),
    reset: site => {
      const { [key]: _dropped, ...rest } = site.texts;
      return { ...site, texts: rest };
    },
    isDefault: site => site.texts[key] === undefined,
  }));
  return [...identity, ...pageTexts];
}

/**
 * Why a value cannot be saved, or null.
 * @param {{required: boolean, textKey?: string}} field
 * @param {string} value
 * @returns {'required'|'tooLong'|null}
 */
export function fieldProblem(field, value) {
  if (field.required && !value.trim()) return 'required';
  if (field.textKey && value.length > MAX_TEXT_LENGTH) return 'tooLong';
  return null;
}
