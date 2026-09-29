import { useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { useSaveQueue, useSite } from '../../api/drafts.jsx';
import { fieldPage } from '../../lib/preview.js';
import { textFields } from '../../lib/site-fields.js';
import { useMediaQuery } from '../../ui/useMediaQuery.js';
import { Button } from '../../ui/Button.jsx';
import { FieldSheet } from './FieldSheet.jsx';
import { LinksEditor } from './LinksEditor.jsx';
import { PreviewFrame } from './PreviewFrame.jsx';
import { usePreview } from './usePreview.js';
import './site.css';

const t = texts.admin.site;
const FIELDS = textFields(texts);
/** Wide enough to show the preview beside the fields. */
export const WIDE = '(min-width: 900px)';

/**
 * The site's identity, links, home and contact page (spec, "Sito"). Each field is a row
 * that opens a sheet to edit it. The preview is the real site reading the draft: beside the
 * fields on a computer, above the field in the sheet on a phone.
 */
export function SiteScreen() {
  const { site, setSite, dataUpdatedAt } = useSite();
  const queue = useSaveQueue();
  const wide = useMediaQuery(WIDE);
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState('/');
  const [full, setFull] = useState(false);
  const [linksSaving, setLinksSaving] = useState(false);
  const preview = usePreview({ draftVersion: linksSaving ? undefined : dataUpdatedAt, fieldOpen: Boolean(editing) || linksSaving });

  const open = field => {
    setEditing(field);
    setFull(false);
    setPage(fieldPage(field.id));
    preview.focus(field.id);
  };
  const close = () => {
    const field = editing;
    if (!field) return;
    setEditing(null);
    preview.focus(null);
    // Leaving a field saves it at once (spec); then the page shows the saved text itself.
    queue.flush().then(() => preview.reset(field.id));
  };

  const changeLinks = update => {
    setLinksSaving(true);
    if (setSite(prev => ({ ...prev, links: update(prev.links) }), { now: true })) {
      queue.flush().then(() => {
        setLinksSaving(false);
        if (!queue.holds('site')) preview.reload();
      });
    } else setLinksSaving(false);
  };
  const linksOpen = () => { setPage('/'); preview.focus('site.links'); };

  const group = (name, title) => (
    <section className="dash-site-group" aria-labelledby={`dash-site-${name}`}>
      <h2 id={`dash-site-${name}`} className="dash-label">{title}</h2>
      <ul className="dash-site-rows">
        {FIELDS.filter(field => field.group === name).map(field => {
          const value = site ? field.read(site) : '';
          return (
            <li key={field.id}>
              <button type="button" className="dash-site-row" onClick={() => open(field)} disabled={!site}>
                <span className="dash-site-row__label">{t[field.label]}</span>
                <span className={`dash-site-row__value${value ? '' : ' dash-site-row__value--empty'}`}>{value || t.emptyValue}</span>
                {site && field.isDefault?.(site) && <span className="dash-site-row__badge">{t.templateText}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className={`dash-site${wide ? ' dash-site--wide' : ''}`}>
      <div className="dash-site__fields">
        <h1 className="dash-screen-title">{t.sectionTitle}</h1>
        {group('who', t.groupWho)}
        <section className="dash-site-group" aria-labelledby="dash-site-links">
          <h2 id="dash-site-links" className="dash-label">{t.groupLinks}</h2>
          <LinksEditor links={site?.links} onChange={changeLinks} onOpen={linksOpen} onClose={() => preview.focus(null)} side={wide} />
        </section>
        {group('home', t.groupHome)}
        {group('contact', t.groupContact)}
      </div>
      {wide && (
        <div className="dash-site__preview">
          <PreviewFrame frameRef={preview.frameRef} page={page} full />
        </div>
      )}
      <FieldSheet field={editing} site={site} onChange={setSite} onClose={close} preview={preview} side={wide}>
        {!wide && editing && (
          <div className="dash-site__slice">
            <PreviewFrame frameRef={preview.frameRef} page={page} full={full} />
            <Button onClick={() => setFull(value => !value)} aria-pressed={full}>{full ? t.previewPart : t.previewFull}</Button>
          </div>
        )}
      </FieldSheet>
    </div>
  );
}
