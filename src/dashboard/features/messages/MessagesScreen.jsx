import { useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { siteConfig } from '../../../../config/site.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useDeleteMessage, useMessages } from '../../api/messages.js';
import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
import './messages.css';

const t = texts.admin.messages;

/** Messages received through the public contact form. */
export function MessagesScreen() {
  const query = useMessages();
  const deletion = useDeleteMessage();
  const [confirming, setConfirming] = useState(null);

  if (query.isPending) {
    return <><h1 className="dash-screen-title">{t.sectionTitle}</h1><p className="dash-empty" role="status">{t.loading}</p></>;
  }

  if (query.isError) {
    return <><h1 className="dash-screen-title">{t.sectionTitle}</h1><p className="dash-error" role="alert">{t.loadError}</p></>;
  }

  const onConfirmDelete = async () => {
    try {
      await deletion.mutateAsync(confirming.id);
      setConfirming(null);
    } catch {
      // Keep the message in the list and expose the failed action below.
    }
  };

  return (
    <section className="dash-messages" aria-labelledby="dash-messages-title">
      <h1 id="dash-messages-title" className="dash-screen-title">{t.sectionTitle}</h1>
      {deletion.isError && <p className="dash-error" role="alert">{t.deleteError}</p>}
      {deletion.isSuccess && <p className="dash-messages__notice" role="status">{t.deleted}</p>}
      {query.data.length === 0 ? <p className="dash-empty">{t.empty}</p> : (
        <div className="dash-messages__list">
          {query.data.map(message => (
            <article className="dash-message" key={message.id}>
              <header className="dash-message__header">
                <h2 className="dash-message__sender">{message.name}</h2>
                <time className="dash-message__date" dateTime={new Date(message.receivedAt).toISOString()}>
                  {new Date(message.receivedAt).toLocaleDateString(siteConfig.language ?? 'it-IT')}
                </time>
              </header>
              {message.subject && <h3 className="dash-message__subject">{message.subject}</h3>}
              <p className="dash-message__email">{message.email}</p>
              <p className="dash-message__body">{message.message}</p>
              <div className="dash-message__actions">
                <a className="dash-message__reply" href={`mailto:${message.email}`}>{t.reply}</a>
                <button className="dash-message__delete" type="button" onClick={() => { deletion.reset(); setConfirming(message); }}>
                  {t.delete}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? formatText(t.confirmDelete, { nome: confirming.name }) : t.confirmDelete}
        body={t.confirmDeleteBody}
        confirmLabel={t.confirmDeleteAction}
        cancelLabel={t.cancel}
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirming(null)}
        busy={deletion.isPending}
      />
    </section>
  );
}
