import { html } from '../../shared/html.js';
import { texts } from '../../../config/texts.config.js';
/**
 * Generates HTML for the admin top bar with optional navigation or back link.
 * @param {Object} config - Configuration object.
 * @param {boolean} config.showBackLink - If true, show back link; if false, show nav buttons.
 * @returns {import('../../shared/html.js').SafeHtml} HTML for the top bar header.
 */
export function topBarHtml({ showBackLink }) {
  const navButtons = !showBackLink ? html`
    <nav class="admin-topbar__nav">
      <a href="#/" class="admin-topbar__nav-link">${texts.admin.common.navAlbums}</a>
      <a href="#/messages" class="admin-topbar__nav-link">${texts.admin.common.navMessages}</a>
    </nav>
  ` : '';
  return html`
    <header class="admin-topbar">
      <span class="admin-topbar__icon">📷</span>
      ${showBackLink ? html`<a class="admin-back" href="#/">${texts.admin.common.allAlbums}</a>` : ''}
      ${navButtons}
    </header>
  `;
}
