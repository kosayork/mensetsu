import { STATUS, loadQuestions, filterQuestions } from './data.js';
import { LearningStore, STORAGE_KEY } from './storage.js';

const $ = selector => document.querySelector(selector);
const state = { data: null, filters: { category: 'all', importance: 'all', search: '' }, openIds: new Set(), revealedIds: new Set() };
let store;
try { store = new LearningStore(); }
catch { store = new LearningStore({ getItem: () => { throw new Error('Storage unavailable'); }, setItem: () => { throw new Error('Storage unavailable'); } }); }
let noticeTimeout;

// JSON content is always inserted as text, including user-provided replacement data.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showNotice(message, error = false) {
  clearTimeout(noticeTimeout);
  const notice = $('#save-notice');
  notice.textContent = message;
  notice.className = `save-notice visible${error ? ' error' : ''}`;
  noticeTimeout = setTimeout(() => notice.classList.remove('visible'), error ? 8000 : 2500);
}

function renderProgress() {
  const progress = store.getProgress(state.data.questions);
  $('#completed-count').textContent = progress.ready;
  $('#total-count').textContent = ` / ${progress.total} 問`;
  $('#progress-percent').replaceChildren(document.createTextNode(String(progress.percent)), element('span', '', '%'));
  $('#progress-fill').style.width = `${progress.percent}%`;
  $('#progress-bar').setAttribute('aria-valuenow', progress.percent);
  $('#progress-bar').setAttribute('aria-valuetext', `${progress.total}問中${progress.ready}問が回答できる`);
  for (const status of Object.keys(STATUS)) $(`#${status}-count`).textContent = progress[status];
}

function setCategory(category) {
  state.filters.category = category;
  $('#category-filter').value = category;
  renderList();
}

function renderCategoryNav() {
  const nav = $('#category-nav');
  nav.replaceChildren();
  const entries = [{ id: 'all', name: 'すべての質問' }, ...state.data.categories];
  entries.forEach((category, index) => {
    const count = state.data.questions.filter(question => category.id === 'all' || question.categoryId === category.id).length;
    const button = element('button', 'category-button');
    button.type = 'button';
    button.dataset.category = category.id;
    button.append(element('span', 'category-index', index === 0 ? '▦' : String(index).padStart(2, '0')), element('span', '', category.name), element('span', 'category-count', count));
    button.addEventListener('click', () => setCategory(category.id));
    nav.append(button);
  });
  const select = $('#category-filter');
  select.replaceChildren();
  entries.forEach(category => {
    const option = element('option', '', category.id === 'all' ? 'すべてのカテゴリ' : category.name);
    option.value = category.id;
    select.append(option);
  });
}

function updateCardStatus(card, question) {
  const status = store.getStatus(question.id);
  const badge = card.querySelector('.question-state');
  badge.className = `question-state ${status}`;
  badge.replaceChildren(element('i', `status-dot ${status}`), document.createTextNode(STATUS[status].label));
  card.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = radio.value === status);
}

function createQuestionCard(question, index) {
  const card = element('details', 'question-card');
  card.dataset.questionId = question.id;
  card.open = state.openIds.has(question.id);
  const summary = element('summary', 'question-summary');
  const badge = element('span', `importance-badge ${question.importance.toLowerCase()}`, question.importance);
  badge.setAttribute('aria-label', `重要度${question.importance}`);
  const chevron = element('span', 'chevron');
  chevron.setAttribute('aria-hidden', 'true');
  summary.append(element('span', 'question-number', `Q${String(index + 1).padStart(2, '0')}`), element('span', 'question-title', question.question), badge, element('span', 'question-state'), chevron);
  const content = element('div', 'question-content');

  const answerSection = element('section', 'content-section');
  const answerTitle = element('h4', '', '回答例');
  const toggle = element('button', 'answer-toggle');
  toggle.type = 'button';
  const answer = element('div', 'example-answer', question.exampleAnswer);
  answer.id = `example-${question.id}`;
  answer.append(element('small', 'example-caption', state.data.isDummy !== false
    ? 'ダミーの回答例です。自分の経験や考えに置き換えて練習しましょう。'
    : '自分の経験や考えに置き換え、自分の言葉で練習しましょう。'));
  toggle.setAttribute('aria-controls', answer.id);
  function updateAnswer() {
    const visible = state.revealedIds.has(question.id);
    answer.hidden = !visible;
    toggle.setAttribute('aria-expanded', String(visible));
    toggle.replaceChildren(document.createTextNode(visible ? '回答例を閉じる' : '回答例を見る'), element('span', '', visible ? '−' : '+'));
  }
  toggle.addEventListener('click', () => {
    state.revealedIds.has(question.id) ? state.revealedIds.delete(question.id) : state.revealedIds.add(question.id);
    updateAnswer();
  });
  updateAnswer();
  answerSection.append(answerTitle, toggle, answer);
  content.append(answerSection);

  for (const [title, values, className] of [['回答のポイント', question.points, 'point-list'], ['想定される追加質問', question.followUps, 'followup-list']]) {
    const section = element('section', 'content-section');
    const heading = element('h4', '', title);
    const list = element('ul', className);
    values.forEach(value => list.append(element('li', '', value)));
    section.append(heading, list);
    content.append(section);
  }

  const fieldset = element('fieldset', 'study-status-fieldset');
  fieldset.append(element('legend', '', 'この質問の学習状況'));
  const options = element('div', 'status-options');
  Object.entries(STATUS).forEach(([value, { label }]) => {
    const wrapper = element('label', 'status-option');
    const radio = element('input');
    radio.type = 'radio';
    radio.name = `status-${question.id}`;
    radio.value = value;
    radio.addEventListener('change', () => {
      const saved = store.setStatus(question.id, value);
      updateCardStatus(card, question);
      renderProgress();
      showNotice(saved ? '学習状況を保存しました' : '保存できませんでした。この画面内でのみ反映されます。', !saved);
    });
    wrapper.append(radio, document.createTextNode(label));
    options.append(wrapper);
  });
  fieldset.append(options, element('p', 'saved-caption', '選ぶと自動保存されます。'));
  content.append(fieldset);
  card.append(summary, content);
  updateCardStatus(card, question);
  card.addEventListener('toggle', () => {
    if (!card.isConnected) return;
    if (card.open) state.openIds.add(question.id);
    else {
      state.openIds.delete(question.id);
      state.revealedIds.delete(question.id);
      updateAnswer();
    }
  });
  return card;
}

function renderList() {
  const questions = filterQuestions(state.data.questions, state.filters);
  const list = $('#question-list');
  list.replaceChildren();
  const indexes = new Map(state.data.questions.map((question, index) => [question.id, index]));
  state.data.categories.forEach((category, index) => {
    const items = questions.filter(question => question.categoryId === category.id);
    if (!items.length) return;
    const group = element('section', 'question-group');
    const heading = element('div', 'group-heading');
    heading.append(element('span', 'group-number', String(index + 1).padStart(2, '0')), element('h3', '', category.name), element('span', 'group-total', `${items.length}問`), element('span', 'group-line'));
    group.append(heading);
    items.forEach(question => group.append(createQuestionCard(question, indexes.get(question.id))));
    list.append(group);
  });
  $('#visible-count').textContent = `${questions.length}問`;
  $('#empty-state').hidden = questions.length > 0;
  $('#collection-end').hidden = questions.length === 0;
  $('#reset-filters').hidden = state.filters.category === 'all' && state.filters.importance === 'all' && !state.filters.search;
  $('#filter-announcement').textContent = `${questions.length}問の質問を表示しています`;
  document.querySelectorAll('.category-button').forEach(button => {
    const selected = button.dataset.category === state.filters.category;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-importance]').forEach(button => {
    const selected = button.dataset.importance === state.filters.importance;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function resetFilters() {
  state.filters = { category: 'all', importance: 'all', search: '' };
  $('#search-input').value = '';
  $('#category-filter').value = 'all';
  renderList();
}

async function init() {
  $('#question-list').setAttribute('aria-busy', 'true');
  $('#error-state').hidden = true;
  $('#question-list').replaceChildren(element('div', 'loading-state', '質問を読み込んでいます…'));
  try {
    state.data = await loadQuestions();
    $('#hero-category-count').textContent = state.data.categories.length;
    $('#sidebar-category-count').textContent = state.data.categories.length;
    $('#hero-question-count').textContent = state.data.questions.length;
    const isDummy = state.data.isDummy !== false;
    $('.sample-badge').hidden = !isDummy;
    $('.sample-notice').hidden = !isDummy;
    renderCategoryNav();
    renderProgress();
    renderList();
    $('#start-practice').disabled = state.data.questions.length === 0;
    if (!store.available) showNotice('学習状況を読み込めませんでした。保存設定をご確認ください。', true);
  } catch (error) {
    $('#question-list').replaceChildren();
    $('#error-state').hidden = false;
    $('#start-practice').disabled = true;
    console.error('質問の読み込みに失敗しました:', error);
  } finally {
    $('#question-list').setAttribute('aria-busy', 'false');
  }
}

$('#category-filter').addEventListener('change', event => { if (state.data) setCategory(event.target.value); });
$('#search-input').addEventListener('input', event => {
  state.filters.search = event.target.value;
  if (state.data) renderList();
});
document.querySelectorAll('[data-importance]').forEach(button => button.addEventListener('click', () => {
  state.filters.importance = button.dataset.importance;
  if (state.data) renderList();
}));
$('#reset-filters').addEventListener('click', resetFilters);
$('#empty-reset').addEventListener('click', resetFilters);
$('#retry-load').addEventListener('click', init);
$('#start-practice').addEventListener('click', () => {
  if (!state.data?.questions.length) return;
  resetFilters();
  const questions = state.data.questions;
  const target = questions.find(question => question.importance === 'A' && store.getStatus(question.id) !== 'ready')
    || questions.find(question => store.getStatus(question.id) !== 'ready') || questions[0];
  state.openIds.add(target.id);
  const card = [...document.querySelectorAll('.question-card')].find(card => card.dataset.questionId === target.id);
  card.open = true;
  card.querySelector('summary').focus({ preventScroll: true });
  card.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
});
window.addEventListener('storage', event => {
  if ((event.key === STORAGE_KEY || event.key === null) && state.data) {
    store.records = Object.create(null);
    store.load();
    renderProgress();
    document.querySelectorAll('.question-card').forEach(card => {
      const question = state.data.questions.find(question => question.id === card.dataset.questionId);
      if (question) updateCardStatus(card, question);
    });
  }
});
init();
