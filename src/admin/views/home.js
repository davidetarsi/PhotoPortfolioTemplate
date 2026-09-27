import { photoUrl } from '../../providers/r2.js';
import { moveItem } from '../sortable.js';
import { texts } from '../../../config/texts.config.js';
import { formatText } from '../../utils/formatText.js';
import { createStatus } from '../status.js';
import { createAlbum } from '../album-creation.js';
import { topBarHtml } from './top-bar.js';
import { html } from '../../shared/html.js';

/**
 * Builds a pending site object with updated name, bio, and social info.
 * @param {Object} changes - Pending changes {name, bio, instagram}.
 * @param {Object} currentSite - Current site object.
 * @returns {Object} New site object with merged changes.
 */
export function buildPendingSite({ name, bio, instagram }, currentSite) {
  return {
    // Keeps fields this form does not edit (links, page texts) instead of dropping them.
    ...currentSite,
    name: name.trim(),
    bio,
    hero: currentSite.hero,
    social: { ...currentSite.social, instagram: instagram.trim() },
  };
}

/**
 * Renders the admin home view for managing site settings and albums.
 * Handles site info editing, hero image selection, album management, and preview.
 * @param {HTMLElement} container - The container to render into.
 * @param {Object} ctx - Admin context with site, albums, API, and dependencies.
 */
export function renderAdminHome(container, ctx) {
  const { site, albums, r2PublicUrl, api, navigate, deps } = ctx;
  const heroSrc = site.hero ? photoUrl(r2PublicUrl, site.hero.album, site.hero.name) : null;

  container.innerHTML = html`
    <section class="admin-panel">
      ${topBarHtml({ showBackLink: false })}
      <h2>${texts.admin.site.sectionTitle}</h2>
      <label>${texts.admin.site.nameLabel} <input name="site-name" type="text"></label>
      <label>${texts.admin.site.bioLabel} <textarea name="site-bio" rows="2"></textarea></label>
      <label>${texts.admin.site.instagramLabel} <input name="site-instagram" type="url" placeholder="https://instagram.com/…"></label>
      <div class="admin-hero">
        <span>${texts.admin.site.heroLabel}</span>
        ${heroSrc ? html`<img class="admin-hero__thumb" alt="">` : html`<em>${texts.admin.site.heroNone}</em>`}
        <select name="hero-album"><option value="">${texts.admin.site.heroChooseAlbum}</option></select>
        <div class="admin-hero__picker"></div>
      </div>
    </section>
    <section class="admin-panel">
      <h2>${texts.admin.albums.sectionTitle}</h2>
      <div class="admin-album-list"></div>
      <div class="admin-new-album">
        <input name="new-album-title" type="text" placeholder="${texts.admin.albums.newTitlePlaceholder}">
        <button class="admin-create-album">${texts.admin.albums.create}</button>
      </div>
    </section>
    <div class="admin-actions">
      <button class="admin-preview-btn" type="button">${texts.admin.site.preview}</button>
      <button class="admin-save-site">${texts.admin.site.save}</button>
      <p class="admin-status" role="status">
        <span class="admin-status__badge"></span>
        <span class="admin-status__text"></span>
        <span class="admin-status__time"></span>
      </p>
    </div>
    <div class="admin-preview" hidden></div>
  `;

  const q = sel => container.querySelector(sel);
  const { say, run } = createStatus(q('.admin-status'));

  // --- site form ---
  q('[name="site-name"]').value = site.name;
  q('[name="site-bio"]').value = site.bio;
  q('[name="site-instagram"]').value = site.social?.instagram ?? '';
  if (heroSrc) q('.admin-hero__thumb').setAttribute('src', heroSrc);

  q('.admin-save-site').addEventListener('click', () => run(async () => {
    const updated = buildPendingSite({
      name: q('[name="site-name"]').value,
      bio: q('[name="site-bio"]').value,
      instagram: q('[name="site-instagram"]').value,
    }, site);
    await api.putSite(updated);
    ctx.site = updated;
    say(texts.admin.site.saved);
  }));

  q('.admin-preview-btn').addEventListener('click', () => {
    const pending = buildPendingSite({
      name: q('[name="site-name"]').value,
      bio: q('[name="site-bio"]').value,
      instagram: q('[name="site-instagram"]').value,
    }, site);
    deps.showPreview(q('.admin-preview'), { name: pending.name, bio: pending.bio, heroUrl: heroSrc, social: pending.social, albums, r2PublicUrl }, texts, deps);
  });

  // --- hero picker: choose album → thumbs → click sets hero ---
  const heroSelect = q('[name="hero-album"]');
  for (const a of albums) {
    const opt = document.createElement('option');
    opt.value = a.slug;
    opt.textContent = a.title;
    heroSelect.appendChild(opt);
  }
  heroSelect.addEventListener('change', () => run(async () => {
    const picker = q('.admin-hero__picker');
    picker.innerHTML = '';
    if (!heroSelect.value) return;
    const res = await deps.fetchManifest(heroSelect.value);
    if (!res.ok) { say(texts.admin.site.heroReadError, true); return; }
    for (const entry of res.data) {
      const img = document.createElement('img');
      img.className = 'admin-hero__choice';
      img.src = photoUrl(r2PublicUrl, heroSelect.value, entry.name);
      img.addEventListener('click', () => run(async () => {
        const updated = { ...ctx.site, hero: { album: heroSelect.value, name: entry.name } };
        await api.putSite(updated);
        ctx.site = updated;
        renderAdminHome(container, ctx); // re-render with new hero
        // The re-render above recreates .admin-status from scratch: the
        // previous closure's say() would write to a now-unmounted node. Must
        // re-attach to the new node for the message to appear.
        createStatus(container.querySelector('.admin-status')).say(texts.admin.site.heroUpdated);
      }));
      picker.appendChild(img);
    }
  }));

  // --- album list: drag&drop reorder, open, delete ---
  const list = q('.admin-album-list');
  for (const a of albums) {
    const row = document.createElement('div');
    row.className = 'admin-album-row';
    row.draggable = true;
    row.innerHTML = html`
      <span class="admin-album-row__handle">⋮⋮</span>
      <a class="admin-album-row__title" href="#/album/${a.slug}"></a>
      <button class="admin-delete-album" title="${texts.admin.albums.deleteTitle}">${texts.admin.albums.delete}</button>
    `;
    row.querySelector('.admin-album-row__title').textContent = a.title;
    row.querySelector('.admin-delete-album').addEventListener('click', () => run(async () => {
      const typed = deps.prompt(formatText(texts.admin.albums.deleteConfirmPrompt, { titolo: a.title }));
      if (typed !== a.title) { say(texts.admin.albums.deleteNameMismatch, true); return; }
      await api.deleteAlbum(a.slug);
      ctx.albums = ctx.albums.filter(x => x.slug !== a.slug);
      renderAdminHome(container, ctx);
    }));
    list.appendChild(row);
  }
  deps.attachSortable(list, (from, to) => run(async () => {
    const reordered = moveItem(ctx.albums, from, to);
    await api.putAlbums(reordered);
    ctx.albums = reordered;
    renderAdminHome(container, ctx);
  }));

  q('.admin-create-album').addEventListener('click', () => run(async () => {
    const result = await createAlbum(q('[name="new-album-title"]').value, ctx);
    if (!result.ok) { say(result.error, true); return; }
    navigate(`#/album/${result.slug}`);
  }));
}
