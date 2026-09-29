import { useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { MAX_LINKS } from '../../../shared/content-rules.js';
import { linkKind, linkLabel } from '../../../shared/site-links.js';
import { moveItem } from '../../lib/sortable.js';
import { Button } from '../../ui/Button.jsx';
import { LinkIcon } from '../../ui/LinkIcon.jsx';
import { MoveButtons } from '../../ui/MoveButtons.jsx';
import { useSortable } from '../../ui/useSortable.js';
import { LinkSheet } from './LinkSheet.jsx';

const t = texts.admin.site;
export function LinksEditor({ links, onChange, onOpen, onClose, side = false }) {
  const [editing, setEditing] = useState(null);
  const move = (from, to) => onChange(prev => moveItem(prev, from, to));
  const listRef = useSortable(move);
  const open = index => { setEditing({ index }); onOpen(); };
  const close = () => { setEditing(null); onClose(); };
  const done = link => {
    const { index } = editing;
    onChange(prev => index === -1 ? [...prev, link] : prev.map((item, i) => i === index ? link : item));
    close();
  };
  const remove = () => {
    const { index } = editing;
    onChange(prev => prev.filter((_, i) => i !== index));
    close();
  };
  const full = (links?.length ?? 0) >= MAX_LINKS;
  const seen = new Map();
  const keyOf = link => { const n = (seen.get(link.url) ?? 0) + 1; seen.set(link.url, n); return `${link.url}#${n}`; };
  return <div className="dash-links">
    {links?.length === 0 && <p className="dash-hint">{t.linksEmpty}</p>}
    <ul ref={listRef} className="dash-site-rows">{(links ?? []).map((link, index) => {
      const name = linkLabel(link, texts);
      return <li key={keyOf(link)} className="dash-link-row" draggable="true">
        <button type="button" className="dash-site-row dash-link-row__open" onClick={() => open(index)}>
          <span className="dash-link-row__name"><LinkIcon kind={linkKind(link.url)} />{name}</span>
          <span className="dash-site-row__value dash-link-row__url">{link.url.replace(/^(https:\/\/|mailto:)/, '')}</span>
        </button>
        <span className="dash-link-row__move"><MoveButtons vertical index={index} total={links.length} onMove={move}
          earlierLabel={formatText(t.moveLinkEarlier, { link: name })} laterLabel={formatText(t.moveLinkLater, { link: name })} /></span>
      </li>;
    })}</ul>
    <Button onClick={() => open(-1)} disabled={!links || full}>{t.addLink}</Button>
    {full && <p className="dash-hint">{formatText(t.linksFull, { n: MAX_LINKS })}</p>}
    <LinkSheet open={editing !== null} side={side} link={editing && editing.index !== -1 ? links?.[editing.index] ?? null : null}
      onDone={done} onRemove={editing && editing.index !== -1 ? remove : undefined} onClose={close} />
  </div>;
}
