'use strict';

function rebuildDeck(options) {
  options = options || {};
  let base = state.section === 'all'
    ? state.cards.slice()
    : state.cards.filter(c => c.section === state.section);
  if (state.severity !== 'all') base = base.filter(c => c.importance === state.severity);
  if (state.shuffled && options.restoreOrder && Array.isArray(state.savedDeckIds)) {
    const byId = new Map();
    for (const card of base) if (!byId.has(card.id)) byId.set(card.id, card);
    const ordered = [];
    for (const id of state.savedDeckIds) {
      if (byId.has(id)) {
        ordered.push(byId.get(id));
        byId.delete(id);
      }
    }
    for (const card of base) if (byId.has(card.id)) ordered.push(card);
    state.deck = ordered.length === base.length ? ordered : base.slice();
    if (state.deck.length !== base.length) shuffleArray(state.deck);
  } else if (state.shuffled) {
    state.deck = base.slice();
    shuffleArray(state.deck);
  } else {
    state.deck = base.slice();
    const rank = { major: 0, mid: 1, minor: 2 };
    state.deck.sort((a, b) => rank[a.importance] - rank[b.importance]);
  }
  if (!options.keepIndex) state.index = 0;
  if (state.index >= state.deck.length || state.index < 0) state.index = 0;
  state.flipped = false;
}

function frontHtml(card) {
  return '<div class="chips"><span class="chip">' + esc(card.section || card.part) + '</span>' + sevBadge(card) + '</div>' +
    '<h2 class="method-name">' + esc(card.name) + '</h2>' +
    '<div class="method-loc">' + esc(card.location) + '</div>' +
    '<p class="flip-hint">Tap the card to reveal the answer</p>';
}

function backHtml(card) {
  return '<div class="back-head">' +
      '<span class="back-title">' + esc(card.name) + ' ' + sevBadge(card) + '</span>' +
      '<button class="btn ghost flip-back" type="button">↺ Flip back</button>' +
    '</div>' + fieldsHtml(card);
}

function renderFlashcard() {
  const front = document.getElementById('fcFront');
  const back = document.getElementById('fcBack');
  const cardEl = document.getElementById('flashcard');
  resetCardTransform();
  syncFlipButton();
  front.scrollTop = 0;
  back.scrollTop = 0;
  if (!state.deck.length) {
    cardEl.classList.remove('flipped');
    front.innerHTML = '<p class="muted">No entries in this section.</p>';
    back.innerHTML = '';
    document.getElementById('fcCounter').textContent = '0 / 0';
    document.getElementById('fcKnown').textContent = '0 / 0 known';
    document.getElementById('fcBar').style.width = '0%';
    return;
  }
  if (state.index >= state.deck.length) state.index = 0;
  if (state.index < 0) state.index = state.deck.length - 1;
  const card = state.deck[state.index];
  state.flipped = false;
  cardEl.classList.remove('flipped');
  front.innerHTML = frontHtml(card);
  back.innerHTML = backHtml(card);
  front.scrollTop = 0;
  back.scrollTop = 0;
  const knownInDeck = state.deck.filter(c => state.known.has(c.id)).length;
  document.getElementById('fcCounter').textContent = 'Card ' + (state.index + 1) + ' / ' + state.deck.length;
  document.getElementById('fcKnown').textContent = knownInDeck + ' / ' + state.deck.length + ' known';
  document.getElementById('fcBar').style.width = (((state.index + 1) / state.deck.length) * 100) + '%';
}

function syncFlipButton() {
  const btn = document.getElementById('flipCardBtn');
  if (btn) btn.textContent = state.flipped ? 'Show question' : 'Flip card';
}

function flipCard() {
  if (!state.deck.length) return;
  state.flipped = !state.flipped;
  document.getElementById('flashcard').classList.toggle('flipped', state.flipped);
  const face = document.getElementById(state.flipped ? 'fcBack' : 'fcFront');
  if (face) face.scrollTop = 0;
  syncFlipButton();
}

const swipe = {
  tracking: false,
  dragged: false,
  animating: false,
  startX: 0,
  startY: 0,
  startTime: 0,
  dx: 0,
  dy: 0,
  pointerId: null
};
let suppressCardClick = false;
let suppressTimer = null;

function suppressNextCardClick() {
  suppressCardClick = true;
  window.clearTimeout(suppressTimer);
  suppressTimer = window.setTimeout(() => { suppressCardClick = false; }, 300);
}

function setSwipeBadges(dx) {
  const left = document.getElementById('swipeBadgeLeft');
  const right = document.getElementById('swipeBadgeRight');
  const amount = Math.min(1, Math.abs(dx) / 110);
  if (left) left.style.opacity = dx < 0 ? String(amount) : '0';
  if (right) right.style.opacity = dx > 0 ? String(amount) : '0';
}

function resetCardTransform() {
  const drag = document.getElementById('cardDrag');
  if (drag) {
    drag.style.transition = '';
    drag.style.transform = '';
    drag.style.opacity = '';
    drag.classList.remove('dragging');
  }
  setSwipeBadges(0);
}

function snapCardBack() {
  const drag = document.getElementById('cardDrag');
  if (!drag) return;
  drag.style.transition = 'transform .2s ease';
  drag.style.transform = '';
  setSwipeBadges(0);
  window.setTimeout(() => {
    if (drag) drag.style.transition = '';
  }, 210);
}

function finishSwipe(direction) {
  const drag = document.getElementById('cardDrag');
  if (!drag || swipe.animating) return;
  swipe.animating = true;
  const distance = Math.max(360, (drag.clientWidth || 320) * 1.15);
  drag.style.transition = 'transform .2s ease-out, opacity .2s ease-out';
  drag.style.transform = 'translateX(' + (direction * distance) + 'px) rotate(' + (direction * 12) + 'deg)';
  drag.style.opacity = '0';
  const live = document.getElementById('swipeLive');
  if (live) live.textContent = direction > 0 ? 'Marked as learned' : 'Marked as still learning';
  window.setTimeout(() => {
    resetCardTransform();
    markCard(direction > 0);
    swipe.animating = false;
  }, 190);
}

function beginSwipe(e) {
  if (swipe.animating || swipe.tracking || !state.deck.length) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target && e.target.closest &&
      e.target.closest('button, a, input, select, textarea, summary')) return;
  swipe.pointerId = e.pointerId;
  swipe.startX = e.clientX;
  swipe.startY = e.clientY;
  swipe.startTime = Date.now();
  swipe.dx = 0;
  swipe.dy = 0;
  swipe.tracking = true;
  swipe.dragged = false;
  const drag = document.getElementById('cardDrag');
  if (drag) drag.style.transition = '';
}

function moveSwipe(e) {
  if (!swipe.tracking || e.pointerId !== swipe.pointerId) return;
  const dx = e.clientX - swipe.startX;
  const dy = e.clientY - swipe.startY;
  swipe.dx = dx;
  swipe.dy = dy;
  if (!swipe.dragged) {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < 7 || absX <= absY * 1.1) return;
    swipe.dragged = true;
    const drag = document.getElementById('cardDrag');
    if (drag) drag.classList.add('dragging');
    const stage = document.getElementById('flashcardStage');
    if (stage && stage.setPointerCapture) {
      try { stage.setPointerCapture(swipe.pointerId); } catch (e) {}
    }
  }
  if (e.cancelable) e.preventDefault();
  const drag = document.getElementById('cardDrag');
  if (drag) {
    drag.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 24) + 'deg)';
  }
  setSwipeBadges(dx);
}

function endSwipe(e) {
  if (!swipe.tracking) return;
  if (e && e.pointerId !== undefined && e.pointerId !== swipe.pointerId) return;
  swipe.tracking = false;
  if (!swipe.dragged) {
    swipe.dx = 0;
    swipe.dy = 0;
    return;
  }
  const stage = document.getElementById('flashcardStage');
  const width = stage ? stage.clientWidth : 320;
  const threshold = Math.max(48, Math.min(92, width * 0.18));
  const elapsed = Math.max(1, Date.now() - swipe.startTime);
  const absDx = Math.abs(swipe.dx);
  const flick = absDx > 28 && elapsed < 300;
  suppressNextCardClick();
  if (absDx >= threshold || flick) {
    finishSwipe(swipe.dx > 0 ? 1 : -1);
  } else {
    snapCardBack();
  }
}

function cancelSwipe(e) {
  if (!swipe.tracking) return;
  if (e && e.pointerId !== undefined && e.pointerId !== swipe.pointerId) return;
  swipe.tracking = false;
  if (swipe.dragged) snapCardBack();
  swipe.dx = 0;
  swipe.dy = 0;
}

function moveCard(delta) {
  if (!state.deck.length) return;
  state.index = (state.index + delta + state.deck.length) % state.deck.length;
  renderFlashcard();
  saveProgress();
}

function markCard(isKnown) {
  if (!state.deck.length) return;
  const card = state.deck[state.index];
  if (isKnown) state.known.add(card.id);
  else state.known.delete(card.id);
  saveProgress();
  updateFooter();
  moveCard(1);
}

function setupFlashcardEvents() {
  document.getElementById('prevCard').addEventListener('click', () => moveCard(-1));
  document.getElementById('nextCard').addEventListener('click', () => moveCard(1));
  document.getElementById('flipCardBtn').addEventListener('click', flipCard);
  document.getElementById('stillBtn').addEventListener('click', () => markCard(false));
  document.getElementById('gotBtn').addEventListener('click', () => markCard(true));

  const cardTap = e => {
    if (suppressCardClick) {
      suppressCardClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    flipCard();
  };
  document.getElementById('fcFront').addEventListener('click', cardTap);
  document.getElementById('fcBack').addEventListener('click', e => {
    if (suppressCardClick) {
      suppressCardClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest('.flip-back')) flipCard();
  });

  const stage = document.getElementById('flashcardStage');
  if (stage) {
    stage.addEventListener('pointerdown', beginSwipe, { passive: false });
    window.addEventListener('pointermove', moveSwipe, { passive: false });
    window.addEventListener('pointerup', endSwipe);
    window.addEventListener('pointercancel', cancelSwipe);
    stage.addEventListener('touchmove', e => {
      if (swipe.dragged && e.cancelable) e.preventDefault();
    }, { passive: false });
    stage.addEventListener('dragstart', e => e.preventDefault());
    stage.addEventListener('click', e => {
      if (!suppressCardClick) return;
      suppressCardClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  document.addEventListener('keydown', e => {
    if (state.mode !== 'flashcards') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.code === 'Space') {
      if (tag === 'button' || tag === 'a') return;
      e.preventDefault();
      flipCard();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveCard(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveCard(-1);
    }
  });
}
