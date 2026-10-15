const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
menu?.addEventListener('click', () => {
  const open = navigation.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
});
navigation?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  navigation.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Mở menu');
}));

// Reveal once on scroll; keyboard focus and reduced-motion always show content.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealTargets = document.querySelectorAll('.hero-copy, .hero-visual, .about-grid > *, .departments article, .section-heading, .activity-photo-card, .campaign-summary, .invitation-heading, .invitation-reasons article, .invitation-bottom, .join > *');
let revealObserver;
const motionToggle = document.querySelector('#motion-toggle');
function setMotion(enabled) {
  revealObserver?.disconnect();
  revealTargets.forEach(element => element.classList.remove('reveal-pending', 'reveal-visible'));
  document.documentElement.classList.toggle('motion-enabled', enabled);
  document.documentElement.classList.toggle('motion-disabled', !enabled);
  motionToggle.textContent = enabled ? 'Tắt hiệu ứng' : 'Bật hiệu ứng';
  motionToggle.setAttribute('aria-pressed', String(enabled));
  if (!enabled || !('IntersectionObserver' in window)) return;
  const reveal = element => {
    element.classList.remove('reveal-pending');
    element.classList.add('reveal-visible');
  };
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { reveal(entry.target); observer.unobserve(entry.target); }
  }), { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  revealObserver = observer;
  revealTargets.forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${index % 3 * 70}ms`);
    element.classList.add('reveal-pending');
    observer.observe(element);
    element.addEventListener('focusin', () => {
      element.classList.remove('reveal-pending', 'reveal-visible');
      observer.unobserve(element);
    }, { once: true });
  });
}
motionToggle.hidden = false;
setMotion(!motionPreference.matches);
motionToggle.addEventListener('click', () => setMotion(motionToggle.getAttribute('aria-pressed') !== 'true'));
motionPreference.addEventListener('change', event => setMotion(!event.matches));
