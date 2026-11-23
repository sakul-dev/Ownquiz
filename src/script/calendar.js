'use strict';

const CALENDAR_KEY = 'ownquiz.calendar.v1';

let calendarCursor = new Date();
let calendarSelected = dateKey();

function dateKey(date) {
  const d = date || new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + month + '-' + day;
}

function parseDateKey(key) {
  const parts = String(key).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function loadLearningLog() {
  const log = readJson(CALENDAR_KEY);
  return log && typeof log === 'object' ? log : {};
}

function saveLearningLog(log) {
  storageSet(CALENDAR_KEY, JSON.stringify(log));
}

function logLearning(kind, value) {
  if (!state.docId) return;
  const log = loadLearningLog();
  const day = dateKey();
  if (!log[day]) log[day] = {};
  const entry = log[day][state.docId] || (log[day][state.docId] = {
    source: state.source,
    slides: [],
    quiz: 0,
    quizCorrect: 0
  });
  entry.source = state.source;
  if (kind === 'slide') {
    if (!Array.isArray(entry.slides)) entry.slides = [];
    if (value && entry.slides.indexOf(value) === -1) entry.slides.push(value);
  } else if (kind === 'quiz') {
    entry.quiz = (entry.quiz || 0) + 1;
    if (value) entry.quizCorrect = (entry.quizCorrect || 0) + 1;
  }
  saveLearningLog(log);
}

function dayTotals(dayEntry) {
  let slides = 0;
  let quiz = 0;
  let quizCorrect = 0;
  for (const id in dayEntry) {
    const entry = dayEntry[id];
    if (!entry) continue;
    slides += Array.isArray(entry.slides) ? entry.slides.length : 0;
    quiz += entry.quiz || 0;
    quizCorrect += entry.quizCorrect || 0;
  }
  return { slides: slides, quiz: quiz, quizCorrect: quizCorrect };
}

function shiftMonth(delta) {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
  calendarSelected = null;
  renderCalendar();
}

function monthTitle(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const titleEl = document.getElementById('calTitle');
  const summaryEl = document.getElementById('calSummary');
  if (!grid || !titleEl) return;

  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (firstDay.getDay() + 6) % 7;
  const log = loadLearningLog();
  const today = dateKey();

  titleEl.textContent = monthTitle(year, month);

  let html = '';
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const label of weekdays) html += '<span class="cal-weekday">' + label + '</span>';
  for (let i = 0; i < leading; i++) html += '<span class="cal-day blank" aria-hidden="true"></span>';

  let monthSlides = 0;
  let monthQuiz = 0;
  let activeDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    const totals = log[key] ? dayTotals(log[key]) : { slides: 0, quiz: 0 };
    const total = totals.slides + totals.quiz;
    if (total > 0) {
      activeDays++;
      monthSlides += totals.slides;
      monthQuiz += totals.quiz;
    }
    const classes = ['cal-day'];
    if (total > 0) classes.push('has-activity');
    if (key === today) classes.push('today');
    if (key === calendarSelected) classes.push('selected');
    html += '<button class="' + classes.join(' ') + '" type="button" data-date="' + key + '"' +
      ' aria-label="' + esc(parseDateKey(key).toLocaleDateString(undefined, { dateStyle: 'long' })) +
      (total > 0 ? ', ' + total + ' items learned' : '') + '">' +
      '<span class="cal-day-num">' + day + '</span>' +
      '</button>';
  }

  const trailing = (7 - ((leading + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) html += '<span class="cal-day blank" aria-hidden="true"></span>';

  grid.innerHTML = html;

  if (summaryEl) {
    if (activeDays > 0) {
      summaryEl.textContent = activeDays + (activeDays === 1 ? ' active day · ' : ' active days · ') +
        monthSlides + (monthSlides === 1 ? ' slide learned · ' : ' slides learned · ') +
        monthQuiz + (monthQuiz === 1 ? ' quiz question' : ' quiz questions');
    } else {
      summaryEl.textContent = 'No learning logged this month.';
    }
  }

  renderCalendarDetail(calendarSelected, log);
}

function renderCalendarDetail(key, log) {
  const detail = document.getElementById('calendarDetail');
  if (!detail) return;
  if (!key) {
    detail.innerHTML = '<p class="muted">Select a day to see what you learned.</p>';
    return;
  }
  const date = parseDateKey(key);
  const title = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dayEntry = log[key];
  if (!dayEntry) {
    detail.innerHTML = '<h3>' + esc(title) + '</h3><p class="muted">No progress logged for this day.</p>';
    return;
  }
  const rows = [];
  for (const id in dayEntry) {
    const entry = dayEntry[id];
    if (!entry) continue;
    const slides = Array.isArray(entry.slides) ? entry.slides.length : 0;
    const quiz = entry.quiz || 0;
    const quizCorrect = entry.quizCorrect || 0;
    const parts = [];
    if (slides) parts.push(slides + (slides === 1 ? ' slide learned' : ' slides learned'));
    if (quiz) {
      parts.push(quiz + (quiz === 1 ? ' quiz question' : ' quiz questions') +
        (quizCorrect ? ' (' + quizCorrect + ' correct)' : ''));
    }
    if (!parts.length) continue;
    rows.push('<li><span class="cal-source">' + esc(entry.source || 'Markdown') + '</span> · ' + parts.join(' · ') + '</li>');
  }
  if (!rows.length) {
    detail.innerHTML = '<h3>' + esc(title) + '</h3><p class="muted">No progress logged for this day.</p>';
    return;
  }
  detail.innerHTML = '<h3>' + esc(title) + '</h3><ul class="cal-list">' + rows.join('') + '</ul>';
}

function setupCalendarEvents() {
  const prev = document.getElementById('calPrev');
  const next = document.getElementById('calNext');
  const grid = document.getElementById('calendarGrid');
  if (prev) prev.addEventListener('click', () => shiftMonth(-1));
  if (next) next.addEventListener('click', () => shiftMonth(1));
  if (grid) {
    grid.addEventListener('click', e => {
      const cell = e.target.closest('.cal-day');
      if (!cell || cell.classList.contains('blank')) return;
      calendarSelected = cell.dataset.date;
      renderCalendar();
    });
  }
}
