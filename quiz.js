'use strict';

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
