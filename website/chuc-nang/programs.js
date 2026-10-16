import { bindPhotoSwipe } from './swipe.js';
// Ba hoạt động dùng chung một vị trí trên trang chủ.
(() => {
  const nav = document.querySelector('.program-jumps');
  if (!nav) return;
  const tabs = [...nav.querySelectorAll('a')];
  const panels = tabs.map(tab => document.querySelector(tab.hash));
  nav.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.id = `program-tab-${index}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
    panels[index].tabIndex = 0;
  });
  function select(index) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  }
  function fromHash(scroll = false) {
    const target = document.getElementById(location.hash.slice(1));
    const index = panels.findIndex(panel => panel === target || panel.contains(target));
    if (index >= 0) {
      select(index);
      if (scroll) target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  select(0);
  fromHash(true);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', event => {
      event.preventDefault();
      select(index);
      history.pushState(null, '', tab.hash);
      document.querySelector('#activities-title').scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].click();
      tabs[next].focus();
    });
  });
  window.addEventListener('hashchange', () => fromHash(true));
  window.addEventListener('popstate', () => fromHash(true));
  const header = document.querySelector('.header');
  const resize = () => document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(header);

  // Xem ảnh bằng bàn phím hoặc chạm; dialog giữ focus trong bộ xem ảnh.
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-viewer';
  dialog.setAttribute('aria-label', 'Ảnh hoạt động của Đội');
  dialog.innerHTML = '<div class="photo-toolbar"><p class="photo-position" aria-live="polite"></p><button type="button" class="photo-close" autofocus>Đóng</button></div><img alt=""><p class="photo-caption"></p><div class="photo-controls"><button type="button" class="photo-prev">Ảnh trước</button><button type="button" class="photo-next">Ảnh sau</button></div>';
  document.body.append(dialog);
  const display = dialog.querySelector('img');
  display.draggable = false;
  const swipeHint = document.createElement('p');
  swipeHint.className = 'photo-swipe-hint';
  swipeHint.textContent = 'Vuốt trái / phải trên ảnh để chuyển';
  display.after(swipeHint);
  const caption = dialog.querySelector('.photo-caption');
  const previous = dialog.querySelector('.photo-prev');
  const next = dialog.querySelector('.photo-next');
  let photos = [], current = 0, opener;
  function step(direction) {
    const index = Math.max(0, Math.min(photos.length - 1, current + direction));
    if (index !== current) { current = index; render(); }
  }
  const resetSwipe = bindPhotoSwipe(display, step);
  function render() {
    const photo = photos[current];
    display.src = photo.src;
    display.alt = photo.alt;
    caption.textContent = photo.closest('figure').querySelector('figcaption')?.textContent || photo.alt;
    dialog.querySelector('.photo-position').textContent = `Ảnh ${current + 1} / ${photos.length}`;
    previous.disabled = current === 0;
    next.disabled = current === photos.length - 1;
  }
  panels.forEach(panel => {
    const images = [...panel.querySelectorAll('figure img')];
    images.forEach((image, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'photo-open';
      button.setAttribute('aria-label', `Xem ảnh ${index + 1}: ${image.alt}`);
      image.before(button);
      button.append(image);
      button.addEventListener('click', () => {
        photos = images; current = index; opener = button;
        render(); dialog.showModal();
      });
    });
  });
  dialog.querySelector('.photo-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { resetSwipe(); opener?.focus({ preventScroll: true }); });
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous.click(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next.click(); }
  });
})();
