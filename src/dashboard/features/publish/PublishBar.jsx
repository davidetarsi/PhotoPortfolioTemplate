import { useEffect, useRef, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useDiscard, useDraftStatus, usePublish } from '../../api/queries.js';
import { useSaveQueue, useSaveState } from '../../api/drafts.jsx';
import { Sheet } from '../../ui/Sheet.jsx';
import { Button } from '../../ui/Button.jsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
import './publish.css';

const t = texts.admin.publish;
/** How long a confirmation stays on screen. */
export const MESSAGE_MS = 4000;

/** One line per problem that stops a publication. */
export function describeProblem({ slug, name, reason }) {
  const template = { PHOTO_MISSING: t.problemPhotoMissing, COVER_NOT_IN_ALBUM: t.problemCover, HERO_NOT_IN_ALBUM: t.problemHero }[reason];
  return formatText(template ?? t.problemPhotoMissing, { album: slug, name });
}

/** One line per change the publication would make. */
export function describeChange({ type, slug, count }) {
  const template = {
    site: t.changeSite,
    'albums-reordered': t.changeAlbumsReordered,
    'album-added': t.changeAlbumAdded,
    'album-removed': t.changeAlbumRemoved,
    'album-changed': t.changeAlbumChanged,
    'photos-added': t.changePhotosAdded,
    'photos-removed': t.changePhotosRemoved,
    'photos-reordered': t.changePhotosReordered,
  }[type] ?? type;
  return formatText(template, { album: slug, n: count });
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
  const [listing, setListing] = useState(false);
  const queue = useSaveQueue();
  const saveState = useSaveState();
  const starting = useRef(false); // a publication is being started (double-click guard)
  // An upload in progress writes to the draft outside the save queue: publishing or
  // discarding waits for it (its mutation key starts with 'draft-save').
  const uploading = useIsMutating({ mutationKey: ['draft-save'] }) > 0;

  const publish = usePublish({ onStep: step => setPhotosLeft(step.done ? null : step.remaining) });
  const discard = useDiscard();

  const { hasDraft = false, publishing = false, changes = [] } = status.data ?? {};
  const dirty = hasDraft || publishing;

  // A confirmation ("Published.", "Changes discarded.") is for the moment: it goes away by
  // itself, and as soon as new changes appear.
  const wasDirty = useRef(dirty);
  useEffect(() => {
    if (dirty && !wasDirty.current) setMessage(null);
    wasDirty.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (message?.tone !== 'ok') return undefined;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!dirty && !message) return null;

  const onPublish = async () => {
    // One publication at a time, even with a quick double click.
    if (starting.current) return;
    starting.current = true;
    setMessage(null);
    setProblems([]);
    // What is still waiting is saved first: the draft published is the one on screen.
    await queue.flush();
    const saveError = queue.getState().error;
    if (saveError) {
      starting.current = false;
      setMessage({ text: formatText(t.saveFailed, { message: saveError.message }), tone: 'error' });
      return;
    }
    // No save runs during the publication; changes made meanwhile wait and are saved after.
    // `finally`: the queue always resumes, whatever happens to this component.
    queue.pause();
    try {
      await publish.mutateAsync();
      setPhotosLeft(null);
      setMessage({ text: t.published, tone: 'ok' });
    } catch (error) {
      setPhotosLeft(null);
      if (error.body?.error === 'PUBLISH_CHECK_FAILED') setProblems(error.body.problems ?? []);
      else if (error.body?.error === 'NO_PROGRESS') setMessage({ text: t.noProgress, tone: 'error' });
      else setMessage({ text: formatText(t.failed, { message: error.message }), tone: 'error' });
    } finally {
      queue.resume();
      starting.current = false;
    }
  };

  const onDiscard = async () => {
    setMessage(null);
    setProblems([]);
    // Changes waiting to be saved belong to the draft being discarded.
    queue.pause();
    queue.clear();
    await queue.whenIdle();
    try {
      await discard.mutateAsync();
      setConfirming(false);
      setProblems([]);
      setMessage({ text: t.discarded, tone: 'ok' });
    } catch (error) {
      setConfirming(false);
      setMessage({ text: error.body?.error === 'PUBLISH_IN_PROGRESS' ? t.inProgress : formatText(t.failed, { message: error.message }), tone: 'error' });
    } finally {
      queue.resume();
    }
  };

  const busy = publish.isPending || discard.isPending || saveState.saving || uploading;
  const count = changes.length === 1 ? t.changesOne : formatText(t.changesMany, { n: changes.length });

  return (
    <section className="dash-publish" aria-label={t.regionLabel}>
      <div className="dash-publish__row">
        <p className="dash-publish__count" role="status">
          {publish.isPending ? (photosLeft ? formatText(t.photosLeft, { n: photosLeft }) : t.publishing)
            : dirty && changes.length > 0 ? (
              <button type="button" className="dash-publish__changes" onClick={() => setListing(true)}>{count}</button>
            ) : dirty ? count : message?.text}
        </p>
        {dirty && (
          <div className="dash-publish__actions">
            {/* Once a publication has started it can only be finished (the Worker refuses to discard). */}
            {!publishing && <Button onClick={() => setConfirming(true)} disabled={busy} className="dash-publish__discard">{t.discard}</Button>}
            <a className="dash-button dash-button--secondary" href="/?preview=1" target="_blank" rel="noopener">{t.preview}</a>
            <Button variant="primary" onClick={onPublish} disabled={busy}>{publishing ? t.resume : t.publish}</Button>
          </div>
        )}
      </div>
      {message && dirty && (
        <p className={`dash-publish__message dash-publish__message--${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {problems.length > 0 && (
        <div className="dash-publish__problems" role="alert">
          <p>{t.problemsTitle}</p>
          <ul>{problems.map(problem => <li key={`${problem.slug}/${problem.name}/${problem.reason}`}>{describeProblem(problem)}</li>)}</ul>
        </div>
      )}
      <Sheet open={listing} onClose={() => setListing(false)} title={t.changesTitle}>
        <ul className="dash-publish__list">
          {changes.map(change => <li key={`${change.type}/${change.slug ?? ''}`}>{describeChange(change)}</li>)}
        </ul>
        <div className="dash-confirm__actions">
          <Button onClick={() => setListing(false)}>{t.close}</Button>
        </div>
      </Sheet>
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
