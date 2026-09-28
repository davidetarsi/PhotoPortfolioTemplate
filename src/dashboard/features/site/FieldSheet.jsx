import { useEffect, useId, useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { MAX_TEXT_LENGTH } from '../../../shared/content-rules.js';
import { fieldProblem } from '../../lib/site-fields.js';
import { Sheet } from '../../ui/Sheet.jsx';
import { Button } from '../../ui/Button.jsx';

const t = texts.admin.site;

/**
 * Edits one text of the site in a sheet. What is typed stays here and goes to the preview
 * at every key; it is saved while it is valid (an empty name or a text over the limit is
 * not: the last good value is kept, and the field says why). `preview` is the slice of the
 * page shown above the field on a phone; on a computer (`side`) the sheet opens over the
 * fields, leaving the preview beside it in view.
 * @param {{field: object|null, site: object, onChange: (update: (site: object) => object) => void, onClose: Function,
 *   preview: {field: Function}, side?: boolean, children?: any}} props
 */
export function FieldSheet({ field, site, onChange, onClose, preview, side = false, children }) {
  const [value, setValue] = useState('');
  const inputId = useId();
  const errorId = useId();

  // A field opened: start from its value in the draft.
  useEffect(() => {
    if (field) setValue(field.read(site));
  }, [field?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = field ? fieldProblem(field, value) : null;
  const change = next => {
    setValue(next);
    preview.field(field.id, next);
    // A function of the latest site: another change saved meanwhile is kept.
    if (!fieldProblem(field, next)) onChange(latest => field.write(latest, next));
  };
  const reset = () => {
    onChange(latest => field.reset(latest));
    const text = field.read(field.reset(site));
    setValue(text);
    preview.field(field.id, text);
  };

  const Input = field?.multiline ? 'textarea' : 'input';
  return (
    <Sheet open={field !== null} onClose={onClose} title={field ? t[field.label] : ''} className={`dash-field-sheet${side ? ' dash-field-sheet--side' : ''}`}>
      {children}
      {field && (
        <div className="dash-form">
          {/* The sheet's title already names the field: the label is for screen readers. */}
          <label htmlFor={inputId} className="visually-hidden">{t[field.label]}</label>
          <Input id={inputId} className="dash-input" value={value} rows={field.multiline ? 4 : undefined}
            aria-invalid={problem ? 'true' : undefined} aria-describedby={problem ? errorId : undefined}
            onChange={event => change(event.target.value)} />
          {problem && (
            <p id={errorId} className="dash-form__error" role="alert">
              {problem === 'required' ? t.nameRequired : formatText(t.textTooLong, { n: MAX_TEXT_LENGTH })}
            </p>
          )}
          {field.id === 'texts.about.form.successMessage' && <p className="dash-hint">{t.formNote}</p>}
        </div>
      )}
      <div className="dash-confirm__actions">
        {field?.reset && !field.isDefault(site) && <Button onClick={reset}>{t.restoreDefault}</Button>}
        <Button variant="primary" onClick={onClose}>{t.done}</Button>
      </div>
    </Sheet>
  );
}
