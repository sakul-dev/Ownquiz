'use strict';

const LEGACY_STORAGE_KEY = 'methods-trainer-known-v1';
const STORAGE_PREFIX = 'ownquiz.v1.';
const REGISTRY_KEY = 'ownquiz.docs.v1';
const CHUNK_SIZE = 200000;

const state = {
  cards: [],
  deck: [],
  index: 0,
  flipped: false,
  known: new Set(),
  mode: 'flashcards',
  shuffled: false,
  section: 'all',
  severity: 'all',
  source: 'METHODS.md',
  docId: '',
  savedDeckIds: null,
  storageWarning: ''
};

let quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

function readJson(key) {
  const raw = storageGet(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function hashString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function documentId(md) {
  return 'd' + hashString(String(md));
}

function docKey(suffix) {
  return STORAGE_PREFIX + state.docId + '.' + suffix;
}

function readRegistry() {
  const list = readJson(REGISTRY_KEY);
  return Array.isArray(list) ? list : [];
}

function writeRegistry(list) {
  storageSet(REGISTRY_KEY, JSON.stringify(list));
}

function registerSavedDocument(meta) {
  const list = readRegistry().filter(d => d.id !== meta.id);
  list.unshift(meta);
  writeRegistry(list);
  renderSavedOptions();
}

function unregisterSavedDocument(id) {
  writeRegistry(readRegistry().filter(d => d.id !== id));
  renderSavedOptions();
}

function saveDocument(id, name, text) {
  const metaKey = STORAGE_PREFIX + id + '.meta';
  const oldMeta = readJson(metaKey);
  const chunks = Math.max(1, Math.ceil(text.length / CHUNK_SIZE));
  try {
    for (let i = 0; i < chunks; i++) {
      const chunkKey = STORAGE_PREFIX + id + '.md.' + i;
      const chunk = text.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      if (!storageSet(chunkKey, chunk)) throw new Error('localStorage quota exceeded');
    }
    if (oldMeta && oldMeta.chunks > chunks) {
      for (let i = chunks; i < oldMeta.chunks; i++) storageRemove(STORAGE_PREFIX + id + '.md.' + i);
    }
    const meta = { id: id, name: name, size: text.length, chunks: chunks, savedAt: Date.now() };
    if (!storageSet(metaKey, JSON.stringify(meta))) throw new Error('localStorage quota exceeded');
    registerSavedDocument(meta);
    return true;
  } catch (e) {
    if (!oldMeta) {
      for (let i = 0; i < chunks; i++) storageRemove(STORAGE_PREFIX + id + '.md.' + i);
      storageRemove(metaKey);
      unregisterSavedDocument(id);
    }
    state.storageWarning = 'Could not save "' + name + '" locally; browser storage may be full.';
    return false;
  }
}

function loadDocument(id) {
  const meta = readJson(STORAGE_PREFIX + id + '.meta');
  if (!meta || !meta.chunks) throw new Error('The saved data for this file is missing.');
  let text = '';
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = storageGet(STORAGE_PREFIX + id + '.md.' + i);
    if (chunk === null) throw new Error('Saved file is incomplete (missing part ' + (i + 1) + ' of ' + meta.chunks + ').');
    text += chunk;
  }
  return { meta: meta, text: text };
}

function renderSavedOptions() {
  const sel = document.getElementById('savedSelect');
  if (!sel) return;
  const list = readRegistry();
  let html = '<option value="">Saved files…</option>' +
    '<option value="__default__">METHODS.md (default)</option>';
  for (const doc of list) {
    const when = doc.savedAt ? new Date(doc.savedAt).toLocaleDateString() : '';
    const size = doc.size ? Math.max(1, Math.round(doc.size / 1024)) + ' KB' : '';
    const label = doc.name + (size ? ' · ' + size : '') + (when ? ' · ' + when : '');
    html += '<option value="' + esc(doc.id) + '">' + esc(label) + '</option>';
  }
  sel.innerHTML = html;
  sel.value = state.docId && list.some(d => d.id === state.docId) ? state.docId : '';
}

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

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plain(md) {
  return String(md)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function inlineHtml(md) {
  let s = esc(md);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function blockHtml(md) {
  const lines = String(md).split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) {
      out.push('<p>' + para.map(inlineHtml).join(' ') + '</p>');
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push('</' + list + '>');
      list = null;
    }
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { flushPara(); closeList(); continue; }
    let m;
    if ((m = t.match(/^-\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push('<li>' + inlineHtml(m[1]) + '</li>');
    } else if ((m = t.match(/^\d+\.\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push('<li>' + inlineHtml(m[1]) + '</li>');
    } else {
      closeList();
      para.push(t);
    }
  }
  flushPara();
  closeList();
  return out.join('');
}

function fieldsHtml(card) {
  return card.fields.map(f =>
    '<div class="field">' +
      '<div class="field-label">' + esc(f.label) + '</div>' +
      '<div class="field-value">' + blockHtml(f.value) + '</div>' +
    '</div>'
  ).join('');
}

function sevBadge(card) {
  return '<span class="sev sev-' + card.importance + '">' + card.importance + '</span>';
}

function parseMethods(md) {
  const lines = md.split(/\r?\n/);
  const cards = [];
  let part = '';
  let section = '';
  let current = null;
  let currentField = null;
  const cardLevel = /^####\s+/m.test(md) ? 4 : /^###\s+/m.test(md) ? 3 : /^##\s+/m.test(md) ? 2 : 1;

  const flush = () => {
    if (!current) return;
    current.fieldMap = {};
    current.plainMap = {};
    for (const f of current.fields) {
      current.fieldMap[f.label] = f.value;
      current.plainMap[f.label] = plain(f.value);
    }
    current.searchText = [current.name, current.location, current.section, current.part]
      .concat(current.fields.map(f => f.label + ' ' + f.value))
      .join(' ')
      .toLowerCase();
    const imp = (current.fieldMap['Importance'] || '').toLowerCase();
    current.importance = /\bmajor\b/.test(imp) ? 'major' : /\bminor\b/.test(imp) ? 'minor' : 'mid';
    current.id = current.name;
    cards.push(current);
    current = null;
    currentField = null;
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const rest = heading[2].trim();
      if (level === cardLevel) {
        flush();
        const codeMatch = rest.match(/`([^`]+)`/);
        const name = codeMatch ? codeMatch[1] : rest;
        const dashMatch = rest.match(/—\s*(.+)$/);
        current = {
          name: name,
          title: plain(rest),
          location: dashMatch ? plain(dashMatch[1]) : '',
          part: plain(part),
          section: plain(section),
          fields: [],
          fieldMap: {},
          id: name
        };
        currentField = null;
      } else if (level === cardLevel - 1) {
        flush();
        section = rest;
      } else if (level <= cardLevel - 2) {
        flush();
        part = rest;
        section = '';
      }
      continue;
    }
    if (/^---\s*$/.test(line)) { flush(); continue; }
    if (!current) continue;
    const fieldMatch = line.match(/^\s*-\s+\*\*(.+?):\*\*\s*(.*)$/) ||
      line.match(/^\s*-\s+\*\*(.+?)\*\*:\s*(.*)$/);
    if (fieldMatch) {
      const field = { label: fieldMatch[1].trim(), value: fieldMatch[2].trim() };
      current.fields.push(field);
      currentField = field;
      continue;
    }
    if (currentField) {
      const t = line.trim();
      if (!t) continue;
      currentField.value += (currentField.value ? '\n' : '') + t;
    }
  }
  flush();
  return cards;
}
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function saveProgress() {
  if (!state.docId) return;
  const payload = {
    known: Array.from(state.known),
    index: state.index,
    mode: state.mode,
    section: state.section,
    severity: state.severity,
    shuffled: state.shuffled,
    deckIds: state.shuffled ? state.deck.map(c => c.id) : []
  };
  storageSet(docKey('progress'), JSON.stringify(payload));
}

function loadProgress() {
  state.known = new Set();
  state.index = 0;
  state.mode = 'flashcards';
  state.section = 'all';
  state.severity = 'all';
  state.shuffled = false;
  state.savedDeckIds = null;
  const saved = readJson(docKey('progress'));
  if (saved) {
    if (Array.isArray(saved.known)) state.known = new Set(saved.known);
    if (Number.isInteger(saved.index)) state.index = saved.index;
    if (saved.mode) state.mode = saved.mode;
    if (saved.section) state.section = saved.section;
    if (saved.severity) state.severity = saved.severity;
    state.shuffled = !!saved.shuffled;
    if (Array.isArray(saved.deckIds)) state.savedDeckIds = saved.deckIds;
    return;
  }
  const legacy = readJson(LEGACY_STORAGE_KEY);
  if (Array.isArray(legacy) && state.source === 'METHODS.md') {
    state.known = new Set(legacy);
    storageRemove(LEGACY_STORAGE_KEY);
  }
}

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
  syncFlipButton();
}

const swipe = {
  tracking: false,
  dragged: false,
  animating: false,
  startX: 0,
  startY: 0,
  dx: 0,
  dy: 0,
  pointerId: null
};
let suppressCardClick = false;
let suppressTimer = null;

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
  drag.style.transition = 'transform .22s ease, opacity .22s ease';
  drag.style.transform = 'translateX(' + (direction * 120) + '%) rotate(' + (direction * 14) + 'deg)';
  drag.style.opacity = '0';
  const live = document.getElementById('swipeLive');
  if (live) live.textContent = direction > 0 ? 'Marked as learned' : 'Marked as still learning';
  window.setTimeout(() => {
    swipe.animating = false;
    resetCardTransform();
    markCard(direction > 0);
  }, 200);
}

function beginSwipe(e) {
  if (swipe.animating || !state.deck.length) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (swipe.tracking && e.pointerId !== swipe.pointerId) return;
  swipe.pointerId = e.pointerId;
  swipe.startX = e.clientX;
  swipe.startY = e.clientY;
  swipe.dx = 0;
  swipe.dy = 0;
  swipe.tracking = true;
  swipe.dragged = false;
}

function moveSwipe(e) {
  if (!swipe.tracking || e.pointerId !== swipe.pointerId) return;
  const dx = e.clientX - swipe.startX;
  const dy = e.clientY - swipe.startY;
  swipe.dx = dx;
  swipe.dy = dy;
  if (!swipe.dragged) {
    if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
    swipe.dragged = true;
    const drag = document.getElementById('cardDrag');
    if (drag) drag.classList.add('dragging');
  }
  if (e.cancelable) e.preventDefault();
  const drag = document.getElementById('cardDrag');
  if (drag) {
    drag.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 22) + 'deg)';
  }
  setSwipeBadges(dx);
}

function endSwipe() {
  if (!swipe.tracking) return;
  swipe.tracking = false;
  if (!swipe.dragged) return;
  const width = document.getElementById('flashcardStage');
  const threshold = Math.max(70, Math.min(130, (width ? width.clientWidth : 320) * 0.28));
  suppressCardClick = true;
  window.clearTimeout(suppressTimer);
  suppressTimer = window.setTimeout(() => { suppressCardClick = false; }, 320);
  if (Math.abs(swipe.dx) >= threshold) {
    finishSwipe(swipe.dx > 0 ? 1 : -1);
  } else {
    snapCardBack();
  }
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
const QUESTION_TYPES = [
  {
    field: 'Plain-language use',
    label: 'Plain-language use',
    prompt: c => 'What is <code>' + esc(c.name) + '</code> used for, in plain language?'
  },
  {
    field: 'What it does',
    label: 'What it does',
    prompt: c => 'What does <code>' + esc(c.name) + '</code> do, technically?'
  },
  {
    field: 'Parameters',
    label: 'Parameters',
    prompt: c => 'What parameters does <code>' + esc(c.name) + '</code> take?'
  },
  {
    field: 'Called from',
    label: 'Called from',
    prompt: c => 'Where is <code>' + esc(c.name) + '</code> called from?'
  },
  {
    field: 'Returns',
    label: 'Returns',
    prompt: c => 'What does <code>' + esc(c.name) + '</code> return?'
  }
];

function buildQuestionPools() {
  const pools = {};
  for (const type of QUESTION_TYPES) {
    const seen = new Set();
    const arr = [];
    for (const c of shuffleArray(state.cards.slice())) {
      const t = c.plainMap[type.field];
      if (!t || seen.has(t)) continue;
      seen.add(t);
      arr.push(t);
    }
    pools[type.field] = arr;
  }
  const names = [];
  const seenNames = new Set();
  for (const c of shuffleArray(state.cards.slice())) {
    if (seenNames.has(c.name)) continue;
    seenNames.add(c.name);
    names.push(c.name);
  }
  pools.names = names;
  return pools;
}

function pickDistractors(pool, correct, count) {
  const out = [];
  if (!pool || pool.length <= 1) return out;
  const start = Math.floor(Math.random() * pool.length);
  for (let i = 0; i < pool.length && out.length < count; i++) {
    const t = pool[(start + i) % pool.length];
    if (t === correct) continue;
    out.push(t);
  }
  return out;
}

function makeQuestion(card, pools) {
  const candidates = [];
  for (const type of QUESTION_TYPES) {
    const correctText = card.plainMap[type.field];
    if (!correctText) continue;
    const distractors = pickDistractors(pools[type.field], correctText, 3);
    if (distractors.length >= 2) {
      candidates.push({ label: type.label, promptHtml: type.prompt(card), correctText: correctText, distractors: distractors });
    }
  }

  const clueRaw = card.plainMap['Plain-language use'] || card.plainMap['What it does'];
  if (clueRaw) {
    let clue = clueRaw;
    if (clue.length > 240) clue = clue.slice(0, 240) + '…';
    const distractors = pickDistractors(pools.names, card.name, 3);
    if (clue && distractors.length >= 2) {
      candidates.push({
        label: 'Reverse lookup',
        promptHtml: 'Which entry matches this description?<span class="clue">“' + esc(clue) + '”</span>',
        correctText: card.name,
        distractors: distractors
      });
    }
  }

  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const options = shuffleArray(
    [{ text: pick.correctText, correct: true }].concat(
      pick.distractors.map(t => ({ text: t, correct: false }))
    )
  );
  return {
    card: card,
    label: pick.label,
    promptHtml: pick.promptHtml,
    options: options,
    correctText: pick.correctText
  };
}

function saveQuizState() {
  if (!state.docId) return;
  const payload = {
    deckIds: state.deck.map(c => c.id),
    pos: quiz.pos,
    correct: quiz.correct,
    answered: quiz.answered,
    selected: quiz.selected,
    order: quiz.order.map(q => ({
      cardId: q.card ? q.card.id : '',
      label: q.label,
      promptHtml: q.promptHtml,
      options: q.options,
      correctText: q.correctText
    }))
  };
  storageSet(docKey('quiz'), JSON.stringify(payload));
}

function clearQuizState() {
  if (state.docId) storageRemove(docKey('quiz'));
}

function restoreQuizState() {
  const saved = readJson(docKey('quiz'));
  if (!saved || !Array.isArray(saved.order) || !Array.isArray(saved.deckIds)) return null;
  if (saved.deckIds.length !== state.deck.length) return null;
  for (let i = 0; i < saved.deckIds.length; i++) {
    if (saved.deckIds[i] !== state.deck[i].id) return null;
  }
  const byId = new Map();
  for (const card of state.cards) if (!byId.has(card.id)) byId.set(card.id, card);
  const order = [];
  for (const item of saved.order) {
    const card = byId.get(item.cardId);
    if (!card || !item.label || !Array.isArray(item.options)) return null;
    order.push({
      card: card,
      label: item.label,
      promptHtml: item.promptHtml,
      options: item.options,
      correctText: item.correctText
    });
  }
  return {
    order: order,
    pos: Number.isInteger(saved.pos) ? saved.pos : 0,
    correct: Number.isInteger(saved.correct) ? saved.correct : 0,
    answered: Number.isInteger(saved.answered) ? saved.answered : 0,
    current: null,
    selected: Number.isInteger(saved.selected) ? saved.selected : null
  };
}

function startQuiz(forceNew) {
  if (!forceNew) {
    const saved = restoreQuizState();
    if (saved && saved.order.length && saved.pos <= saved.order.length) {
      quiz = saved;
      renderQuiz();
      return;
    }
  }
  quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };
  const pools = buildQuestionPools();
  const source = shuffleArray(state.deck.slice());
  quiz.order = source.map(c => makeQuestion(c, pools)).filter(Boolean);
  quiz.selected = null;
  saveQuizState();
  renderQuiz();
}

function feedbackHtml(q, index) {
  const chosen = q.options[index];
  const correctOption = q.options.find(o => o.correct);
  const correctText = correctOption ? correctOption.text : '';
  let html = chosen && chosen.correct
    ? '<strong>Correct!</strong>'
    : '<strong>Not quite.</strong> Correct answer: <span class="correct-text">' + esc(correctText) + '</span>';
  html += '<details class="fb-details"><summary>Show details</summary>' + fieldsHtml(q.card) + '</details>';
  return html;
}

function renderQuiz() {
  const body = document.getElementById('quizBody');
  if (!state.deck.length) {
    body.innerHTML = '<div class="panel center muted">No entries in this section.</div>';
    return;
  }
  if (!quiz.order.length) {
    body.innerHTML = '<div class="panel center muted">Not enough content to build questions for this section.</div>';
    return;
  }
  if (quiz.pos >= quiz.order.length) {
    renderQuizSummary();
    return;
  }
  const q = quiz.order[quiz.pos];
  quiz.current = q;
  const selected = Number.isInteger(quiz.selected) ? quiz.selected : null;
  quiz.selected = selected;
  const opts = q.options.map((o, i) => {
    let cls = 'option';
    if (selected !== null) {
      if (o.correct) cls += ' correct';
      else if (i === selected) cls += ' wrong';
    }
    return '<button class="' + cls + '" type="button" data-index="' + i + '"' +
      (selected !== null ? ' disabled' : '') + '>' + esc(o.text) + '</button>';
  }).join('');
  const answered = selected !== null;
  const feedbackClass = answered
    ? 'feedback ' + (q.options[selected] && q.options[selected].correct ? 'correct' : 'wrong')
    : 'feedback hidden';
  body.innerHTML =
    '<div class="study-head">' +
      '<div>Question ' + (quiz.pos + 1) + ' / ' + quiz.order.length + '</div>' +
      '<div>Score: ' + quiz.correct + ' / ' + quiz.answered + '</div>' +
    '</div>' +
    '<div class="progress"><div class="bar" style="width:' + ((quiz.pos / quiz.order.length) * 100) + '%"></div></div>' +
    '<div class="quiz-card">' +
      '<div class="chips left"><span class="chip">' + esc(q.label) + '</span>' + sevBadge(q.card) + '</div>' +
      '<h2 class="quiz-prompt">' + q.promptHtml + '</h2>' +
      '<div class="options" id="options">' + opts + '</div>' +
      '<div class="' + feedbackClass + '" id="feedback">' + (answered ? feedbackHtml(q, selected) : '') + '</div>' +
      '<button class="btn primary' + (answered ? '' : ' hidden') + '" type="button" id="nextQuestion">Next question →</button>' +
    '</div>';
  if (!answered) {
    body.querySelectorAll('.option').forEach(btn => {
      btn.addEventListener('click', () => answerQuiz(Number(btn.dataset.index)));
    });
  }
  document.getElementById('nextQuestion').addEventListener('click', nextQuestion);
}

function answerQuiz(index) {
  const q = quiz.current;
  if (!q || quiz.selected !== null) return;
  const chosen = q.options[index];
  if (!chosen) return;
  quiz.selected = index;
  quiz.answered++;
  if (chosen.correct) quiz.correct++;
  document.querySelectorAll('.option').forEach((btn, idx) => {
    btn.disabled = true;
    if (q.options[idx].correct) btn.classList.add('correct');
    else if (idx === index) btn.classList.add('wrong');
  });
  const fb = document.getElementById('feedback');
  fb.classList.remove('hidden');
  fb.className = 'feedback ' + (chosen.correct ? 'correct' : 'wrong');
  fb.innerHTML = feedbackHtml(q, index);
  document.getElementById('nextQuestion').classList.remove('hidden');
  document.getElementById('nextQuestion').focus();
  const head = document.querySelector('#quizBody .study-head');
  if (head) head.lastElementChild.textContent = 'Score: ' + quiz.correct + ' / ' + quiz.answered;
  saveQuizState();
}

function nextQuestion() {
  quiz.pos++;
  quiz.selected = null;
  saveQuizState();
  renderQuiz();
}

function renderQuizSummary() {
  const total = quiz.answered || 0;
  const pct = total ? Math.round((quiz.correct / total) * 100) : 0;
  saveQuizState();
  document.getElementById('quizBody').innerHTML =
    '<div class="quiz-card summary">' +
      '<h2>Quiz complete</h2>' +
      '<div class="big-score">' + quiz.correct + ' / ' + total + '</div>' +
      '<p class="muted">' + pct + '% correct</p>' +
      '<div class="progress"><div class="bar" style="width:' + pct + '%"></div></div>' +
      '<button class="btn primary" type="button" id="restartQuiz">Start again</button>' +
    '</div>';
  document.getElementById('restartQuiz').addEventListener('click', () => startQuiz(true));
}
function renderBrowse() {
  const searchEl = document.getElementById('browseSearch');
  const q = searchEl.value.trim().toLowerCase();
  const base = state.section === 'all'
    ? state.cards
    : state.cards.filter(c => c.section === state.section);
  const filtered = q
    ? base.filter(c => c.searchText.indexOf(q) !== -1)
    : base;
  const list = document.getElementById('browseList');
  if (!filtered.length) {
    list.innerHTML = '<p class="muted">No entries match your search.</p>';
    return;
  }
  const groups = new Map();
  for (const c of filtered) {
    const key = c.part + ' \u0000 ' + c.section;
    if (!groups.has(key)) groups.set(key, { part: c.part, section: c.section, items: [] });
    groups.get(key).items.push(c);
  }
  let html = '';
  for (const g of groups.values()) {
    html += '<div class="browse-group"><h3>' + esc(g.section || g.part) + '</h3>';
    for (const c of g.items) {
      html += '<details class="browse-item" data-card="' + state.cards.indexOf(c) + '">' +
        '<summary><span class="browse-title"><code>' + esc(c.name) + '</code>' + sevBadge(c) + '</span><span class="loc">' + esc(c.location) + '</span></summary>' +
        '<div class="browse-detail"></div>' +
      '</details>';
    }
    html += '</div>';
  }
  list.innerHTML = html;
}

function loadBrowseDetail(details) {
  const detail = details.querySelector('.browse-detail');
  if (!detail || detail.dataset.loaded === '1') return;
  const card = state.cards[Number(details.dataset.card)];
  if (!card) return;
  detail.innerHTML = fieldsHtml(card);
  detail.dataset.loaded = '1';
}

function buildSectionFilter() {
  const sel = document.getElementById('sectionFilter');
  const sections = [];
  for (const c of state.cards) {
    if (c.section && sections.indexOf(c.section) === -1) sections.push(c.section);
  }
  let opts = '<option value="all">All sections (' + state.cards.length + ')</option>';
  for (const s of sections) {
    const n = state.cards.filter(c => c.section === s).length;
    opts += '<option value="' + esc(s) + '">' + esc(s) + ' (' + n + ')</option>';
  }
  sel.innerHTML = opts;
  sel.value = state.section;
  if (sel.value !== state.section) {
    state.section = 'all';
    sel.value = 'all';
  }
}

function buildSeverityFilter() {
  const sel = document.getElementById('severityFilter');
  const counts = { all: state.cards.length, major: 0, mid: 0, minor: 0 };
  for (const c of state.cards) counts[c.importance]++;
  sel.innerHTML =
    '<option value="all">All importance (' + counts.all + ')</option>' +
    '<option value="major">Major (' + counts.major + ')</option>' +
    '<option value="mid">Mid (' + counts.mid + ')</option>' +
    '<option value="minor">Minor (' + counts.minor + ')</option>';
  sel.value = state.severity;
}

function updateFooter() {
  const el = document.getElementById('footerStats');
  if (!el) return;
  const counts = { major: 0, mid: 0, minor: 0 };
  for (const c of state.cards) counts[c.importance]++;
  el.textContent = state.cards.length + ' entries loaded from ' + state.source + ' (' + counts.major + ' major · ' + counts.mid + ' mid · ' + counts.minor + ' minor) · ' + state.known.size + ' marked known · deck ordered major → mid → minor unless shuffled' + (state.storageWarning ? ' · ' + state.storageWarning : '');
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + mode));
  if (mode === 'flashcards') renderFlashcard();
  else if (mode === 'quiz') startQuiz();
  else renderBrowse();
  saveProgress();
  updateFooter();
  closeMenu();
}

function setupEvents() {
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
  const menuClose = document.getElementById('menuClose');
  if (menuClose) menuClose.addEventListener('click', closeMenu);
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

  document.getElementById('tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab) setMode(tab.dataset.mode);
  });

  document.getElementById('sectionFilter').addEventListener('change', e => {
    state.section = e.target.value;
    rebuildDeck();
    if (state.mode === 'flashcards') renderFlashcard();
    else if (state.mode === 'quiz') startQuiz();
    else renderBrowse();
    saveProgress();
    updateFooter();
  });

  document.getElementById('severityFilter').addEventListener('change', e => {
    state.severity = e.target.value;
    rebuildDeck();
    if (state.mode === 'flashcards') renderFlashcard();
    else if (state.mode === 'quiz') startQuiz();
    else renderBrowse();
    saveProgress();
    updateFooter();
  });

  document.getElementById('shuffleBtn').addEventListener('click', () => {
    state.shuffled = !state.shuffled;
    document.getElementById('shuffleBtn').textContent = 'Shuffle: ' + (state.shuffled ? 'on' : 'off');
    rebuildDeck();
    if (state.mode === 'flashcards') renderFlashcard();
    else if (state.mode === 'quiz') startQuiz();
    else renderBrowse();
    saveProgress();
    updateFooter();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    state.known.clear();
    state.index = 0;
    clearQuizState();
    quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };
    saveProgress();
    if (state.mode === 'flashcards') renderFlashcard();
    else if (state.mode === 'quiz') startQuiz(true);
    else renderBrowse();
    updateFooter();
  });

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
    stage.addEventListener('pointerdown', beginSwipe);
    stage.addEventListener('pointermove', moveSwipe);
    stage.addEventListener('pointerup', endSwipe);
    stage.addEventListener('pointercancel', endSwipe);
    stage.addEventListener('lostpointercapture', endSwipe);
    stage.addEventListener('dragstart', e => e.preventDefault());
    window.addEventListener('pointermove', moveSwipe);
    window.addEventListener('pointerup', endSwipe);
    window.addEventListener('pointercancel', endSwipe);
  }

  document.getElementById('browseSearch').addEventListener('input', renderBrowse);
  document.getElementById('browseList').addEventListener('toggle', e => {
    const details = e.target;
    if (details.classList && details.classList.contains('browse-item') && details.open) {
      loadBrowseDetail(details);
    }
  }, true);

  const importInput = document.getElementById('importInput');
  document.getElementById('importBtn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', e => {
    importFile(e.target.files && e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('fileInput').addEventListener('change', e => {
    importFile(e.target.files && e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('savedSelect').addEventListener('change', e => {
    const id = e.target.value;
    if (!id) return;
    if (id === '__default__') {
      loadDefaultDocument();
      return;
    }
    try {
      const saved = loadDocument(id);
      start(saved.text, saved.meta.name);
    } catch (err) {
      showLoadError(err);
    }
  });
  renderSavedOptions();

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

function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => start(String(reader.result), file.name, { persist: true });
  reader.onerror = () => showLoadError(new Error('Could not read the selected file.'));
  reader.readAsText(file);
}

function showLoadError(err) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loadError').classList.remove('hidden');
  document.getElementById('loadErrorMsg').textContent = err && err.message ? err.message : String(err);
}

function start(md, source, options) {
  options = options || {};
  const name = source || 'METHODS.md';
  const cards = parseMethods(md);
  if (!cards.length) {
    showLoadError(new Error('No entries were found in ' + name + '. Add headings such as "#### Name" to mark each entry.'));
    return;
  }
  state.docId = documentId(md);
  state.source = name;
  state.cards = cards;
  state.storageWarning = '';
  if (options.persist) saveDocument(state.docId, name, md);
  loadProgress();
  const validIds = new Set(state.cards.map(c => c.id));
  state.known = new Set(Array.from(state.known).filter(id => validIds.has(id)));
  quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };
  buildSectionFilter();
  buildSeverityFilter();
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('loadError').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('shuffleBtn').textContent = 'Shuffle: ' + (state.shuffled ? 'on' : 'off');
  rebuildDeck({ keepIndex: true, restoreOrder: true });
  setMode(state.mode || 'flashcards');
  renderSavedOptions();
  updateFooter();
}

async function fetchDefaultMarkdown() {
  const res = await fetch('METHODS.md', { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (/^\s*<!doctype html/i.test(text)) throw new Error('The server returned an HTML page instead of Markdown.');
  return text;
}

async function loadDefaultDocument() {
  try {
    start(await fetchDefaultMarkdown(), 'METHODS.md');
  } catch (err) {
    showLoadError(err);
  }
}

async function boot() {
  try {
    start(await fetchDefaultMarkdown(), 'METHODS.md');
  } catch (err) {
    showLoadError(err);
  }
}

setupEvents();
boot();