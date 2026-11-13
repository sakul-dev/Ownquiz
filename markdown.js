'use strict';

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
