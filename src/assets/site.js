const menu = document.querySelector('.gh-burger');
menu?.addEventListener('click', () => {
  const open = document.body.classList.toggle('gh-head-open');
  menu.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('gh-head-open')) {
    document.body.classList.remove('gh-head-open');
    menu?.setAttribute('aria-expanded', 'false');
    menu?.focus();
  }
});
