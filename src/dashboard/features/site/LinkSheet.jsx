import { useEffect, useId, useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { MAX_LINK_LABEL } from '../../../shared/content-rules.js';
import { LINK_KINDS, linkKind } from '../../../shared/site-links.js';
import { checkLink, completeLinkUrl } from '../../lib/links.js';
import { Sheet } from '../../ui/Sheet.jsx';
import { Button } from '../../ui/Button.jsx';
import { LinkIcon } from '../../ui/LinkIcon.jsx';

const t = texts.admin.site;
const kindName = kind => LINK_KINDS[kind] ?? texts.links[kind] ?? kind;

export function LinkSheet({ open, link, onDone, onRemove, onClose, side = false }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState(null);
  const urlId = useId(); const labelId = useId(); const errorId = useId();
  useEffect(() => {
    if (!open) return;
    setUrl(link?.url ?? ''); setLabel(link?.label ?? ''); setProblem(null);
  }, [open, link]);
  const kind = linkKind(completeLinkUrl(url));
  const done = () => {
    const checked = checkLink(url, label);
    if (!checked.ok) { setProblem(checked.problem); return; }
    onDone(checked.link);
  };
  const message = problem === 'url' ? t.linkUrlInvalid : problem === 'label' ? formatText(t.linkLabelTooLong, { n: MAX_LINK_LABEL }) : null;
  return (
    <Sheet open={open} onClose={onClose} title={link ? t.editLink : t.newLink}
      className={`dash-field-sheet${side ? ' dash-field-sheet--side' : ''}`}>
      <div className="dash-form">
        <label htmlFor={urlId} className="dash-label">{t.linkUrlLabel}</label>
        <div className="dash-link-input"><LinkIcon kind={kind} />
          <input id={urlId} className="dash-input" type="text" inputMode="url" autoComplete="off" value={url}
            placeholder="https://" aria-invalid={problem === 'url' ? 'true' : undefined}
            aria-describedby={problem === 'url' ? errorId : undefined}
            onChange={event => { setUrl(event.target.value); setProblem(null); }} />
        </div>
        <p className="dash-hint">{t.linkUrlHint}</p>
        <label htmlFor={labelId} className="dash-label">{t.linkLabelLabel}</label>
        <input id={labelId} className="dash-input" value={label} placeholder={kindName(kind)}
          aria-invalid={problem === 'label' ? 'true' : undefined} aria-describedby={problem === 'label' ? errorId : undefined}
          onChange={event => { setLabel(event.target.value); setProblem(null); }} />
        <p className="dash-hint">{formatText(t.linkLabelHint, { kind: kindName(kind) })}</p>
        {message && <p id={errorId} className="dash-form__error" role="alert">{message}</p>}
      </div>
      <div className="dash-confirm__actions">
        {onRemove && <Button variant="danger" onClick={onRemove}>{t.removeLink}</Button>}
        <Button onClick={onClose}>{t.cancel}</Button><Button variant="primary" onClick={done}>{t.done}</Button>
      </div>
    </Sheet>
  );
}
