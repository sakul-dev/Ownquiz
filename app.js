'use strict';

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

function refreshView() {
  if (state.mode === 'flashcards') renderFlashcard();
  else if (state.mode === 'quiz') startQuiz();
  else renderBrowse();
}

function setupEvents() {
  setupMenuEvents();
  setupFlashcardEvents();
  setupBrowseEvents();

  document.getElementById('tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab) setMode(tab.dataset.mode);
  });

  document.getElementById('sectionFilter').addEventListener('change', e => {
    state.section = e.target.value;
    rebuildDeck();
    refreshView();
    saveProgress();
    updateFooter();
  });

  document.getElementById('severityFilter').addEventListener('change', e => {
    state.severity = e.target.value;
    rebuildDeck();
    refreshView();
    saveProgress();
    updateFooter();
  });

  document.getElementById('shuffleBtn').addEventListener('click', () => {
    state.shuffled = !state.shuffled;
    document.getElementById('shuffleBtn').textContent = 'Shuffle: ' + (state.shuffled ? 'on' : 'off');
    rebuildDeck();
    refreshView();
    saveProgress();
    updateFooter();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    state.known.clear();
    state.index = 0;
    clearQuizState();
    quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };
    saveProgress();
    refreshView();
    updateFooter();
  });

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
