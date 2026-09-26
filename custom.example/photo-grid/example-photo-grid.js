import './example-photo-grid.css';

export default {
  mount(container, { photos, onPhotoClick }) {
    const grid = document.createElement('div');
    grid.className = 'photo-grid example-photo-grid';

    photos.forEach((photo, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'example-photo-grid__item';
      button.setAttribute('aria-label', `Open photo ${index + 1}`);
      const image = document.createElement('img');
      image.src = photo.gridUrl;
      image.alt = '';
      image.width = photo.width;
      image.height = photo.height;
      image.loading = 'lazy';
      button.appendChild(image);
      button.addEventListener('click', () => onPhotoClick(index, button));
      grid.appendChild(button);
    });

    container.replaceChildren(grid);
    return { destroy() { container.replaceChildren(); } };
  },
};
