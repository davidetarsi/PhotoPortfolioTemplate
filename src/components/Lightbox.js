/**
 * Creates a lightbox component for fullscreen photo viewing.
 * Handles keyboard navigation (Tab focus trap, Escape to close, arrows to navigate),
 * touch swipe gestures, and click-outside-to-close.
 */
import '../styles/lightbox.css';

/**
 * Instantiates a lightbox with photo array.
 * @param {Array} photos - Array of photo objects with fullUrl, name.
 * @returns {object} Object with open(index, triggerEl), close(), and destroy() methods.
 */
export function createLightbox(photos, { onClose } = {}) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Foto a schermo intero');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <button class="lightbox__close" aria-label="Chiudi">×</button>
    <button class="lightbox__prev" aria-label="Precedente">‹</button>
    <img class="lightbox__img" src="" alt="">
    <button class="lightbox__next" aria-label="Successiva">›</button>
    <div class="lightbox__caption"></div>
  `;
  document.body.appendChild(el);

  let current = 0;
  let _triggerEl = null;
  const imgEl = el.querySelector('.lightbox__img');
  const capEl = el.querySelector('.lightbox__caption');
  const closeBtn = el.querySelector('.lightbox__close');
  const prevBtn = el.querySelector('.lightbox__prev');
  const nextBtn = el.querySelector('.lightbox__next');

  function update() {
    imgEl.src = photos[current].fullUrl;
    imgEl.alt = photos[current].name;
    capEl.textContent = `${photos[current].name} · ${current + 1}/${photos.length}`;
  }

  function open(index, triggerEl) {
    _triggerEl = triggerEl ?? null;
    current = index;
    update();
    el.classList.add('lightbox--open');
    el.setAttribute('aria-hidden', 'false');
    closeBtn.focus();
  }

  function close() {
    const wasOpen = el.classList.contains('lightbox--open');
    el.classList.remove('lightbox--open');
    el.setAttribute('aria-hidden', 'true');
    imgEl.src = '';
    if (_triggerEl) { _triggerEl.focus(); _triggerEl = null; }
    if (wasOpen) onClose?.(current);
  }

  // For code that creates multiple lightboxes in a page's lifetime (e.g., admin preview
  // changing photos per album): removes both the element and its document listener.
  function destroy() {
    document.removeEventListener('keydown', onDocumentKeydown);
    close();
    el.remove();
  }

  function step(d) {
    current = (current + d + photos.length) % photos.length;
    update();
  }

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', e => { e.stopPropagation(); step(-1); });
  nextBtn.addEventListener('click', e => { e.stopPropagation(); step(1); });
  el.addEventListener('click', e => { if (e.target === el) close(); });

  el.addEventListener('keydown', e => {
    if (!el.classList.contains('lightbox--open')) return;
    const focusable = [...el.querySelectorAll('button')];
    if (e.key === 'Tab') {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  });

  function onDocumentKeydown(e) {
    if (!el.classList.contains('lightbox--open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  }
  document.addEventListener('keydown', onDocumentKeydown);

  let touchX = null;
  el.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) step(dx > 0 ? -1 : 1);
    touchX = null;
  }, { passive: true });

  return { open, close, destroy };
}
