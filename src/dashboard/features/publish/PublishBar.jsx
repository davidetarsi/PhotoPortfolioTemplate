import { useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useDiscard, useDraftStatus, usePublish } from '../../api/queries.js';
import { Button } from '../../ui/Button.jsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
import './publish.css';

const t = texts.admin.publish;

/** One line per problem that stops a publication. */
export function describeProblem({ slug, name, reason }) {
  const template = { PHOTO_MISSING: t.problemPhotoMissing, COVER_NOT_IN_ALBUM: t.problemCover, HERO_NOT_IN_ALBUM: t.problemHero }[reason];
  return formatText(template ?? t.problemPhotoMissing, { album: slug, name });
}

/**
 * "N changes · Preview · Publish": shown while the draft differs from the published site,
 * or while a publication has to be resumed. Publishes in steps and says what stops it.
 */
export function PublishBar() {
  const status = useDraftStatus();
  const [photosLeft, setPhotosLeft] = useState(null);
  const [message, setMessage] = useState(null); // { text, tone: 'ok' | 'error' }
  const [problems, setProblems] = useState([]);
  const [confirming, setConfirming] = useState(false);

  const publish = usePublish({ onStep: step => setPhotosLeft(step.done ? null : step.remaining) });
  const discard = useDiscard();

  const { hasDraft = false, publishing = false, changes = [] } = status.data ?? {};
  if (!hasDraft && !publishing && !message) return null;

  const onPublish = () => {
    setMessage(null);
    setProblems([]);
    publish.mutate(undefined, {
      onSuccess: () => { setPhotosLeft(null); setMessage({ text: t.published, tone: 'ok' }); },
      onError: error => {
        setPhotosLeft(null);
        if (error.body?.error === 'PUBLISH_CHECK_FAILED') setProblems(error.body.problems ?? []);
        else setMessage({ text: formatText(t.failed, { message: error.message }), tone: 'error' });
      },
    });
  };

  const onDiscard = () => {
    discard.mutate(undefined, {
      onSuccess: () => { setConfirming(false); setProblems([]); setMessage({ text: t.discarded, tone: 'ok' }); },
      onError: error => {
        setConfirming(false);
        setMessage({ text: error.body?.error === 'PUBLISH_IN_PROGRESS' ? t.inProgress : formatText(t.failed, { message: error.message }), tone: 'error' });
      },
    });
  };

  const busy = publish.isPending || discard.isPending;
  const count = changes.length === 1 ? t.changesOne : formatText(t.changesMany, { n: changes.length });

  return (
    <section className="dash-publish" aria-label={t.publish}>
      <div className="dash-publish__row">
        <p className="dash-publish__count" role="status">
          {publish.isPending ? (photosLeft ? formatText(t.photosLeft, { n: photosLeft }) : t.publishing)
            : hasDraft || publishing ? count : message?.text}
        </p>
        {(hasDraft || publishing) && (
          <div className="dash-publish__actions">
            <Button onClick={() => setConfirming(true)} disabled={busy} className="dash-publish__discard">{t.discard}</Button>
            <a className="dash-button dash-button--secondary" href="/?preview=1" target="_blank" rel="noopener">{t.preview}</a>
            <Button variant="primary" onClick={onPublish} disabled={busy}>{publishing ? t.resume : t.publish}</Button>
          </div>
        )}
      </div>
      {message && (hasDraft || publishing) && (
        <p className={`dash-publish__message dash-publish__message--${message.tone}`}>{message.text}</p>
      )}
      {problems.length > 0 && (
        <div className="dash-publish__problems" role="alert">
          <p>{t.problemsTitle}</p>
          <ul>{problems.map(problem => <li key={`${problem.slug}/${problem.name}/${problem.reason}`}>{describeProblem(problem)}</li>)}</ul>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={t.discardTitle}
        body={t.discardBody}
        confirmLabel={t.discardConfirm}
        cancelLabel={t.cancel}
        busy={discard.isPending}
        onConfirm={onDiscard}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
