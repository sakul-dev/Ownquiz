'use strict';

function closeMenu() {
  const toolbar = document.getElementById('toolbar');
  const toggle = document.getElementById('menuToggle');
  const overlay = document.getElementById('menuOverlay');
  if (toolbar) toolbar.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('menu-open');
}

function openMenu() {
  const toolbar = document.getElementById('toolbar');
  const toggle = document.getElementById('menuToggle');
  const overlay = document.getElementById('menuOverlay');
  if (toolbar) {
    toolbar.classList.add('open');
    toolbar.scrollTop = 0;
  }
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  if (overlay) overlay.classList.add('open');
  document.body.classList.add('menu-open');
}

function setupMenuEvents() {
  const menuToggle = document.getElementById('menuToggle');
  const toolbar = document.getElementById('toolbar');
  menuToggle.addEventListener('click', e => {
    e.stopPropagation();
    if (toolbar.classList.contains('open')) closeMenu();
    else openMenu();
  });

  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) {
    const goHome = () => setMode('flashcards');
    homeBtn.addEventListener('click', goHome);
    homeBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goHome();
      }
    });
  }

  const menuOverlay = document.getElementById('menuOverlay');
  if (menuOverlay) menuOverlay.addEventListener('click', closeMenu);

  document.addEventListener('click', e => {
    if (!toolbar.classList.contains('open')) return;
    if (toolbar.contains(e.target) || menuToggle.contains(e.target)) return;
    if (e.target === menuOverlay) return;
    closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMenu();
  });
}
