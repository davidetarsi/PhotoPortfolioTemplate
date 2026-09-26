import { photoUrl } from '../../providers/r2.js';
import { moveItem } from '../sortable.js';
import { partitionBySupport } from '../pipeline.js';
import { texts } from '../../../config/texts.config.js';
import { siteConfig } from '../../../config/site.config.js';
import { formatText } from '../../utils/formatText.js';
import { createStatus } from '../status.js';
import { topBarHtml } from './top-bar.js';
import { html } from '../../shared/html.js';

/**
 * Builds a pending album object with updated description and cover.
 * @param {Object} changes - The pending changes {description, coverName}.
 * @param {Object} currentAlbum - The current album object.
 * @returns {Object} New album object with merged changes.
 */
export function buildPendingAlbum({ description, coverName }, currentAlbum) {
  return { ...currentAlbum, description, coverName };
}

/**
 * Renders the admin album editor view.
 * Handles photo upload, reordering, cover selection, and album metadata.
 * @param {HTMLElement} container - The container to render into.
 * @param {Object} ctx - Admin context with albums, API, and dependencies.
 */
export function renderAdminAlbum(container, ctx) {
  const { slug, r2PublicUrl, api, deps } = ctx;
  const album = ctx.albums.find(a => a.slug === slug);
  container.innerHTML = html`
    <section class="admin-panel">
      ${topBarHtml({ showBackLink: true })}
      <div class="admin-album-header">
        <span class="admin-album-header__icon">📷</span>
        <div class="admin-album-header__text">
          <h2></h2>
          <input class="admin-album-header__subtitle" name="album-description" type="text" aria-label="Sottotitolo" placeholder="Aggiungi un sottotitolo…">
        </div>
      </div>
      <div class="admin-album-toolbar">
        <div class="admin-view-toggle" role="group">
          <button class="admin-view-toggle__btn admin-view-toggle__btn--grid" type="button" title="Vista griglia">▦</button>
          <button class="admin-view-toggle__btn admin-view-toggle__btn--list" type="button" title="Vista lista">☰</button>
        </div>
        <button class="admin-sort-date" type="button">
          <span class="admin-sort-date__label">Ordina per:</span>
          <span class="admin-sort-date__value">${texts.admin.album.date}</span>
        </button>
      </div>
      <div class="admin-photo-grid"></div>
      <div class="admin-dropzone">
        <label class="admin-dropzone__label">
          Trascina qui le foto o <span class="admin-dropzone__browse">scegli i file da caricare</span>
          <input class="admin-dropzone__input" type="file" multiple accept="image/jpeg,image/png,image/webp">
        </label>
        <p class="admin-dropzone__constraints">${texts.admin.album.dropzoneConstraints}</p>
      </div>
      <ul class="admin-progress"></ul>
      <button class="admin-save-album">${texts.admin.album.save}</button>
      <p class="admin-status" role="status">
        <span class="admin-status__badge"></span>
        <span class="admin-status__text"></span>
        <span class="admin-status__time"></span>
      </p>
    </section>
  `;
  container.querySelector('h2').textContent = album?.title ?? slug;

  const q = sel => container.querySelector(sel);
  const { say, run } = createStatus(q('.admin-status'));

  const fallbackAlbum = { slug, title: slug, description: '', coverName: null };
  const pending = { description: album?.description ?? '', coverName: album?.coverName ?? null };
  let detachGuard = null;
  function markDirty() {
    if (!detachGuard) detachGuard = deps.attachBeforeUnloadGuard();
  }
  function clearDirty() {
    if (detachGuard) { detachGuard(); detachGuard = null; }
  }
  // If exiting the album with unsaved changes via hashchange outside the
  // back-link handler (browser Back/Forward, or programmatic navigate()), the
  // router in admin.js overwrites root.innerHTML and discards this closure
  // without calling clearDirty(): the beforeunload listener attached by
  // markDirty() stays bound to window for the rest of the SPA session
  // (accumulates for each dirty album abandoned this way), causing a phantom
  // "Leave site?" prompt on future refresh/close without pending changes.
  // { once: true } ensures this listener itself never accumulates.
  window.addEventListener('hashchange', clearDirty, { once: true });
  q('[name="album-description"]').value = pending.description;
  q('[name="album-description"]').addEventListener('input', () => {
    pending.description = q('[name="album-description"]').value;
    markDirty();
  });

  let manifest = [];
  let viewMode = 'grid';

  function formatPhotoDate(entry) {
    const ts = entry.capturedAt ?? entry.uploadedAt;
    if (ts == null) return '—';
    // Explicit timeZone: 'UTC' — capturedAt/uploadedAt are epoch ms without
    // associated timezone, and without forcing UTC rendering depends on the
    // machine's timezone (real risk even in tests: UTC midnight may fall on
    // the previous day in negative timezones).
    return new Date(ts).toLocaleDateString(siteConfig.language || 'it', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  }

  function handleCoverClick(entry) {
    pending.coverName = entry.name;
    markDirty();
    renderPhotos();
    say(formatText(texts.admin.album.coverSelected, { nome: entry.name }));
  }

  function handleDeleteClick(entry) {
    return run(async () => {
      if (!deps.confirm(formatText(texts.admin.album.confirmDeletePhoto, { nome: entry.name }))) return;
      await api.deletePhoto(slug, entry.name);
      manifest = manifest.filter(e => e.name !== entry.name);
      renderPhotos();
    });
  }

  function buildGridCell(entry, isCover) {
    const cell = document.createElement('figure');
    cell.className = 'admin-photo';
    cell.draggable = true;
    cell.innerHTML = html`
      <img class="admin-photo__img" alt="" loading="lazy">
      <div class="admin-photo__actions">
        <button class="admin-photo__cover${isCover ? ' admin-photo__cover--selected' : ''}" title="${texts.admin.album.coverAsButton}">Cover</button>
        <button class="admin-photo__delete" title="${texts.admin.album.deletePhoto}">✕</button>
      </div>
    `;
    cell.querySelector('.admin-photo__img').setAttribute('src', photoUrl(r2PublicUrl, slug, entry.name));
    cell.querySelector('.admin-photo__cover').addEventListener('click', () => handleCoverClick(entry));
    cell.querySelector('.admin-photo__delete').addEventListener('click', () => handleDeleteClick(entry));
    return cell;
  }

  function buildListRow(entry, isCover) {
    const row = document.createElement('div');
    row.className = 'admin-photo-row';
    row.draggable = true;
    row.innerHTML = html`
      <img class="admin-photo-row__thumb" alt="" loading="lazy">
      <span class="admin-photo-row__name"></span>
      <span class="admin-photo-row__date"></span>
      <div class="admin-photo-row__actions">
        <button class="admin-photo-row__cover${isCover ? ' admin-photo-row__cover--selected' : ''}" title="${texts.admin.album.coverAsButton}">Cover</button>
        <button class="admin-photo-row__delete" title="${texts.admin.album.deletePhoto}">✕</button>
      </div>
    `;
    row.querySelector('.admin-photo-row__thumb').setAttribute('src', photoUrl(r2PublicUrl, slug, entry.name));
    row.querySelector('.admin-photo-row__name').textContent = entry.name;
    row.querySelector('.admin-photo-row__date').textContent = formatPhotoDate(entry);
    row.querySelector('.admin-photo-row__cover').addEventListener('click', () => handleCoverClick(entry));
    row.querySelector('.admin-photo-row__delete').addEventListener('click', () => handleDeleteClick(entry));
    return row;
  }

  function renderPhotos() {
    const grid = q('.admin-photo-grid');
    grid.innerHTML = '';
    grid.classList.toggle('admin-photo-grid--list', viewMode === 'list');
    manifest.forEach(entry => {
      const isCover = entry.name === pending.coverName;
      const node = viewMode === 'list' ? buildListRow(entry, isCover) : buildGridCell(entry, isCover);
      grid.appendChild(node);
    });
  }

  async function startUpload(files) {
    if (files.length === 0) return;

    // Il trascinamento ignora l'attributo `accept` del selettore: un HEIC
    // arriva fin qui. Va fermato adesso, perche' piu' avanti fallirebbe a
    // decodifica e l'utente leggerebbe "riprova", che per un HEIC non
    // funzionera' mai.
    const { supported, unsupported } = partitionBySupport([...files]);
    if (unsupported.length > 0) {
      say(formatText(texts.admin.album.unsupportedFormat,
        { elenco: unsupported.map(f => f.name).join(', ') }), true);
    }
    if (supported.length === 0) return;
    files = supported;

    const progress = q('.admin-progress');
    progress.innerHTML = '';
    const rows = new Map();
    const processFile = await deps.makeProcessFile();
    await run(async () => {
      const result = await deps.runBatch({
        files: [...files],
        existingManifest: manifest,
        processFile,
        uploadPhoto: (name, blob) => api.uploadPhoto(slug, name, blob),
        putManifest: entries => api.putManifest(slug, entries),
        onProgress: (name, phase) => {
          if (!rows.has(name)) {
            const li = document.createElement('li');
            rows.set(name, li);
            progress.appendChild(li);
          }
          rows.get(name).textContent = formatText(texts.admin.album.uploadProgress, { nome: name, fase: phase });
        },
      });
      manifest = result.manifest;
      renderPhotos();
      say(result.failed.length === 0
        ? formatText(texts.admin.album.uploadSuccess, { n: result.uploaded.length })
        : formatText(texts.admin.album.uploadPartial, { uploaded: result.uploaded.length, failed: result.failed.length }),
      result.failed.length > 0);
    });
  }

  // Attached once: the .admin-photo-grid node is created once in the template,
  // renderPhotos() only clears its children. Doing this inside renderPhotos()
  // would accumulate listeners on every render (every drag would trigger N,
  // each with its own putManifest + re-render).
  deps.attachSortable(q('.admin-photo-grid'), (from, to) => run(async () => {
    const reordered = moveItem(manifest, from, to);
    await api.putManifest(slug, reordered);
    manifest = reordered;
    renderPhotos();
  }));

  function setViewMode(mode) {
    viewMode = mode;
    q('.admin-view-toggle__btn--grid').setAttribute('aria-pressed', String(mode === 'grid'));
    q('.admin-view-toggle__btn--list').setAttribute('aria-pressed', String(mode === 'list'));
    renderPhotos();
  }
  setViewMode('grid');
  q('.admin-view-toggle__btn--grid').addEventListener('click', () => setViewMode('grid'));
  q('.admin-view-toggle__btn--list').addEventListener('click', () => setViewMode('list'));

  q('.admin-sort-date').addEventListener('click', () => run(async () => {
    const sortKey = p => p.capturedAt ?? p.uploadedAt ?? 0;
    const sorted = [...manifest].sort((a, b) => sortKey(a) - sortKey(b));
    await api.putManifest(slug, sorted);
    manifest = sorted;
    renderPhotos();
    say(texts.admin.album.sortedByDate);
  }));

  q('.admin-save-album').addEventListener('click', () => run(async () => {
    const updatedAlbum = buildPendingAlbum(pending, album ?? fallbackAlbum);
    const updatedAlbums = ctx.albums.map(a => (a.slug === slug ? updatedAlbum : a));
    await api.putAlbums(updatedAlbums);
    ctx.albums = updatedAlbums;
    clearDirty();
    say(texts.admin.album.saved);
  }));

  // detachGuard is non-null only when there are pending changes: used directly
  // as a proxy for "dirty" instead of a separate boolean to keep in sync.
  q('.admin-back').addEventListener('click', e => {
    if (!detachGuard) return; // No pending changes, navigate freely.
    if (!deps.confirm(texts.admin.album.unsavedChanges)) {
      e.preventDefault();
    } else {
      clearDirty();
    }
  });

  const dropzone = q('.admin-dropzone');
  const fileInput = dropzone.querySelector('input[type="file"]');
  fileInput.addEventListener('change', () => startUpload(fileInput.files));
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('admin-dropzone--over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('admin-dropzone--over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('admin-dropzone--over');
    startUpload(e.dataTransfer?.files ?? []);
  });

  // Bootstrap: manifest 404 = newly created album, empty grid.
  run(async () => {
    const res = await deps.fetchManifest(slug);
    if (res.ok) manifest = res.data;
    else if (res.error !== 'NOT_FOUND') { say(texts.admin.album.manifestError, true); return; }
    renderPhotos();
  });
}
