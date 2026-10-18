// Ba màn dùng một khung sticky. Mỗi nhịp cuộn dừng tại một màn, không chặn trang phía dưới.
(() => {
  const root = document.querySelector('.intro-stages');
  const panels = [...root.querySelectorAll('.intro-scene')];
  const header = document.querySelector('.header');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let step = 1, top = 0, active = 0, enabled = false, lockedUntil = 0, raf = 0;
  // CHỈNH CẢM GIÁC CUỘN: số lớn hơn = cần cuộn/vuốt lâu hơn.
  // Thời gian tính bằng mili giây, khoảng cách tính bằng pixel.
  const scrollOptions = {
    wheelThreshold: 360,
    wheelStepLimit: 120,
    minimumScrollTime: 400,
    resetAfterPause: 900,
    transitionCooldown: 850,
    fullBarHold: 160,
    swipeDistance: 120,
  };
  const { wheelThreshold } = scrollOptions;
  let wheelAmount = 0, wheelDirection = 0, wheelLastAt = 0, wheelStartedAt = 0;
  const progress = document.createElement('div');
  progress.className = 'intro-scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.innerHTML = '<span></span>';
  root.querySelector('.intro-pin').append(progress);
  let pendingAdvance = 0;
  function paintProgress(amount = 0) {
    const panel = panels[active];
    const distance = panel.scrollHeight - panel.clientHeight;
    const reading = distance > 3 ? Math.min(1, panel.scrollTop / distance) * .65 : 0;
    progress.style.setProperty('--scroll-fill', String(reading + (1 - (distance > 3 ? .65 : 0)) * Math.min(1, amount)));
  }
  panels.forEach(panel => panel.addEventListener('scroll', () => { if (panel === panels[active]) paintProgress(wheelAmount / wheelThreshold); }, {passive:true}));
  function finishScroll(direction) {
    if (pendingAdvance) return;
    progress.style.setProperty('--scroll-fill', '1');
    pendingAdvance = setTimeout(() => { pendingAdvance = 0; go(active + direction); }, scrollOptions.fullBarHold);
  }
  function resetWheel() { wheelAmount = 0; wheelDirection = 0; wheelLastAt = 0; }
  function start() { return root.getBoundingClientRect().top + scrollY - top; }
  function select(index) {
    if (active !== index) { clearTimeout(pendingAdvance); pendingAdvance = 0; resetWheel(); }
    active = index;
    panels.forEach((panel, i) => {
      panel.classList.toggle('is-active', i === index);
      panel.inert = enabled && i !== index;
      if (enabled && i !== index) panel.setAttribute('aria-hidden', 'true');
      else panel.removeAttribute('aria-hidden');
    });
    paintProgress(wheelAmount / wheelThreshold);
  }
  function sync() {
    raf = 0;
    if (enabled) select(Math.max(0, Math.min(2, Math.round((scrollY - start()) / step))));
  }
  function setup() {
    top = header.getBoundingClientRect().height;
    step = Math.max(240, innerHeight - top);
    // Chuyển từng màn luôn hoạt động; giảm chuyển động chỉ tắt hiệu ứng mờ.
    enabled = true;
    root.style.setProperty('--intro-top', `${top}px`);
    root.style.setProperty('--intro-height', `${step}px`);
    root.classList.toggle('is-staged', enabled);
    if (enabled) sync(); else select(active);
  }
  function go(index, focus = false) {
    if (!enabled) {
      (panels[index] || document.querySelector('#ve-doi')).scrollIntoView({behavior:'auto'});
      return;
    }
    clearTimeout(pendingAdvance); pendingAdvance = 0;
    resetWheel();
    lockedUntil = performance.now() + scrollOptions.transitionCooldown;
    const y = index > 2 ? start() + step * 3 : start() + step * index;
    window.scrollTo({top:Math.max(0,y),behavior:'instant'});
    sync();
    if (focus) {
      const target = index > 2 ? document.querySelector('#ve-doi h2') : panels[index].querySelector('h1,h2');
      target.tabIndex = -1; target.focus({preventScroll:true});
    }
  }
  function atBoundary(panel, direction) {
    return direction > 0 ? panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 3 : panel.scrollTop <= 1;
  }
  root.addEventListener('wheel', event => {
    if (!enabled || event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX) || event.deltaY === 0) return;
    const offset = scrollY - start();
    if (offset < -top - 2 || offset > step * 2 + 3) return;
    const direction = Math.sign(event.deltaY);
    if (!atBoundary(panels[active], direction) || (active === 0 && direction < 0)) return;
    event.preventDefault();
    const now = performance.now();
    if (pendingAdvance) return;
    if (now < lockedUntil) { resetWheel(); return; }
    if (direction !== wheelDirection || now - wheelLastAt > scrollOptions.resetAfterPause) {
      wheelAmount = 0;
      wheelStartedAt = now;
    }
    wheelDirection = direction;
    wheelLastAt = now;
    const pixels = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? step : 1);
    wheelAmount += Math.min(pixels, scrollOptions.wheelStepLimit);
    paintProgress(Math.min(.95, wheelAmount / wheelThreshold));
    if (wheelAmount >= wheelThreshold && now - wheelStartedAt >= scrollOptions.minimumScrollTime) finishScroll(direction);
  }, {passive:false});
  let touchY = null, touchBoundary = false;
  root.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    touchY = event.touches[0].clientY;
    touchBoundary = atBoundary(panels[active], 1);
  }, {passive:true});
  root.addEventListener('touchmove', event => {
    if (touchY === null || event.touches.length !== 1 || performance.now() < lockedUntil || pendingAdvance) return;
    const delta = touchY - event.touches[0].clientY;
    if ((delta > 0 && touchBoundary) || (delta < 0 && active > 0 && atBoundary(panels[active], -1))) paintProgress(Math.abs(delta) / scrollOptions.swipeDistance);
  }, {passive:true});
  root.addEventListener('touchcancel', () => { touchY = null; paintProgress(); }, {passive:true});
  root.addEventListener('touchend', event => {
    if (!enabled || touchY === null || performance.now() < lockedUntil) return;
    const delta = touchY - event.changedTouches[0].clientY;
    touchY = null;
    if (delta > scrollOptions.swipeDistance && touchBoundary) finishScroll(1);
    else if (delta < -scrollOptions.swipeDistance && active > 0 && atBoundary(panels[active], -1)) finishScroll(-1);
    else paintProgress();
  }, {passive:true});
  root.querySelectorAll('[data-intro-next]').forEach((button, i) => button.addEventListener('click', () => go(i + 1, true)));
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(sync); }, {passive:true});
  addEventListener('resize', setup);
  reduced.addEventListener('change', setup);
  new ResizeObserver(setup).observe(header);
  new MutationObserver(setup).observe(document.documentElement, {attributes:true,attributeFilter:['class']});
  setup();
})();
