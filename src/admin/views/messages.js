import { topBarHtml } from './top-bar.js';
import { formatText } from '../../utils/formatText.js';
import { siteConfig } from '../../../config/site.config.js';

/**
 * Renders the admin messages view for contact form submissions.
 * Fetches and displays all messages with delete functionality.
 * @param {HTMLElement} container - The container to render into.
 * @param {Object} deps - Dependencies with api, say, and confirm methods.
 * @param {Object} texts - Localization strings.
 * @returns {Promise<void>}
 */
export async function renderMessages(container, deps, texts) {
  container.innerHTML = `
    <section class="admin-panel">
      ${topBarHtml({ showBackLink: false })}
      <h2>${texts.admin.messages.sectionTitle}</h2>
      <div class="admin-messages-list"></div>
      <p class="admin-messages-empty" hidden>${texts.admin.messages.empty}</p>
    </section>
  `;

  const q = sel => container.querySelector(sel);
  const { say, confirm } = deps;

  // Load messages
  let res;
  try {
    res = await deps.api.listMessages();
  } catch {
    res = { ok: false };
  }

  if (!res.ok) {
    say(texts.admin.messages.loadError, true);
    return;
  }

  const { messages } = res.data;
  const list = q('.admin-messages-list');
  const emptyMsg = q('.admin-messages-empty');

  if (messages.length === 0) {
    emptyMsg.hidden = false;
    return;
  }

  for (const msg of messages) {
    const row = document.createElement('div');
    row.className = 'admin-message';

    const date = new Date(msg.receivedAt);
    const dateStr = date.toLocaleDateString(siteConfig.language ?? 'it-IT');

    // Fixed markup only: every value below comes from the public contact form,
    // so it is set as text, never parsed as HTML.
    row.innerHTML = `
      <div class="admin-message__header">
        <div class="admin-message__name"></div>
        <div class="admin-message__date"></div>
      </div>
      <div class="admin-message__body"></div>
      <div class="admin-message__actions">
        <a class="admin-message__reply" title="${texts.admin.messages.reply}">${texts.admin.messages.reply}</a>
        <button class="admin-message__delete" type="button">${texts.admin.messages.delete}</button>
      </div>
    `;
    row.querySelector('.admin-message__name').textContent = msg.name;
    row.querySelector('.admin-message__date').textContent = dateStr;
    row.querySelector('.admin-message__body').textContent = msg.message;
    row.querySelector('.admin-message__reply').setAttribute('href', `mailto:${msg.email}`);
    if (msg.subject) {
      const subject = document.createElement('div');
      subject.className = 'admin-message__subject';
      subject.textContent = msg.subject;
      row.querySelector('.admin-message__header').after(subject);
    }

    row.querySelector('.admin-message__delete').addEventListener('click', async () => {
      const confirmText = formatText(texts.admin.messages.confirmDelete, { nome: msg.name });
      if (!confirm(confirmText)) return;

      try {
        await deps.api.deleteMessage(msg.id);
        row.remove();
        say(texts.admin.messages.deleted);
        // If no more messages, show empty message.
        if (list.children.length === 0) {
          emptyMsg.hidden = false;
        }
      } catch (err) {
        say(texts.admin.messages.loadError, true);
      }
    });

    list.appendChild(row);
  }
}
