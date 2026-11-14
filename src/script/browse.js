'use strict';

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

function setupBrowseEvents() {
  document.getElementById('browseSearch').addEventListener('input', renderBrowse);
  document.getElementById('browseList').addEventListener('toggle', e => {
    const details = e.target;
    if (details.classList && details.classList.contains('browse-item') && details.open) {
      loadBrowseDetail(details);
    }
  }, true);
}
