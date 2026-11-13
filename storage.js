'use strict';

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
