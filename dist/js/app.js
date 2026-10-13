import { STATUS, loadQuestions, filterQuestions, loadUniversities, loadPresentation } from './data.js?v=2';
import { LearningStore, getLearningStorageKey, getSelectedUniversity, saveSelectedUniversity } from './storage.js?v=2';
import { PresentationPractice } from './presentation.js';

const $ = selector => document.querySelector(selector);
const state = { university: null, universities: [], mode: 'interview', data: null, presentation: null, filters: { category: 'all', importance: 'all', search: '' }, openIds: new Set(), revealedIds: new Set() };
const dataDirectory = new URL('../data/', import.meta.url);
const stores = new Map();
let storage;
try { storage = window.localStorage; }
catch { storage = { getItem: () => { throw new Error('Storage unavailable'); }, setItem: () => { throw new Error('Storage unavailable'); } }; }
let store;
let noticeTimeout;
let loadToken = 0;
const presentationPractice = new PresentationPractice(element, showNotice);

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
  const progress = store.getProgress(state.data?.questions || []);
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
  if (state.data) renderList();
}

function updatePracticeButton() {
  const presenting = state.mode === 'presentation';
  $('#start-practice-label').textContent = presenting ? 'プレゼン練習をはじめる' : '今日の練習をはじめる';
  $('#start-practice').disabled = presenting ? !state.presentation : !state.data?.questions.length;
  $('.sample-badge').hidden = presenting ? !state.presentation?.isDummy : !state.data || state.data.isDummy === false;
}

function selectMode(mode) {
  state.mode = mode;
  const presenting = mode === 'presentation';
  if (!presenting) presentationPractice.pause();
  $('#presentation-panel').hidden = !presenting;
  $('#interview-panel').hidden = presenting;
  document.querySelectorAll('[data-mode]').forEach(button => {
    const selected = button.dataset.mode === mode;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  $('.skip-link').href = presenting ? '#presentation-panel' : '#questions';
  $('.skip-link').textContent = presenting ? 'プレゼン練習へ移動' : '質問一覧へ移動';
  updatePracticeButton();
}

function selectUniversity(university) {
  if (university.id === state.university?.id) return;
  presentationPractice.reset();
  state.university = university;
  if (!stores.has(university.id)) stores.set(university.id, new LearningStore(storage, getLearningStorageKey(university)));
  store = stores.get(university.id);
  if (store.available) store.load();
  if (!saveSelectedUniversity(storage, university.id)) showNotice('大学の選択を保存できませんでした。この画面内でのみ切り替わります。', true);
  const title = `${university.name} 面接対策`;
  document.title = title;
  $('#university-name').textContent = university.name;
  $('#faculty-name').textContent = `${university.faculty} / ${university.selectionLabel || '総合型選抜'}`;
  $('#footer-title').textContent = title;
  $('.brand').setAttribute('aria-label', `${title} ホーム`);
  $('meta[name="description"]').content = `${university.name}${university.faculty}の面接練習ツール。自分の言葉で答える練習をしよう。`;
  document.querySelectorAll('[data-university]').forEach(button => {
    const selected = button.dataset.university === university.id;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  $('#university-content').setAttribute('aria-labelledby', `university-tab-${university.id}`);
  $('#mode-tabs').hidden = !university.presentationFile;
  if (university.presentationFile) {
    $('#interview-panel').setAttribute('role', 'tabpanel');
    $('#interview-panel').setAttribute('aria-labelledby', 'interview-tab');
  } else {
    $('#interview-panel').removeAttribute('role');
    $('#interview-panel').removeAttribute('aria-labelledby');
  }
  state.filters = { category: 'all', importance: 'all', search: '' };
  state.openIds.clear();
  state.revealedIds.clear();
  $('#search-input').value = '';
  init(university.presentationFile ? 'presentation' : 'interview');
}

// Roving tabindex and arrow keys apply to both kinds of tabs.
function enableTabKeyboard(container) {
  container.addEventListener('keydown', event => {
    const buttons = [...container.querySelectorAll('[role="tab"]')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    const offsets = { ArrowRight: 1, ArrowLeft: -1 };
    let next;
    if (event.key in offsets) next = (index + offsets[event.key] + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next].focus();
    buttons[next].click();
  });
}

async function boot() {
  $('#university-error').hidden = true;
  try {
    const config = await loadUniversities();
    state.universities = config.universities;
    const tabs = $('#university-tabs');
    tabs.replaceChildren();
    state.universities.forEach(university => {
      const button = element('button', 'university-tab');
      button.type = 'button';
      button.id = `university-tab-${university.id}`;
      button.dataset.university = university.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'university-content');
      button.append(element('strong', '', university.name), element('small', '', university.faculty));
      button.addEventListener('click', () => selectUniversity(university));
      tabs.append(button);
    });
    const selectedId = getSelectedUniversity(storage, config.defaultUniversityId);
    selectUniversity(state.universities.find(university => university.id === selectedId)
      || state.universities.find(university => university.id === config.defaultUniversityId));
    $('#university-content').hidden = false;
  } catch (error) {
    $('#university-content').hidden = true;
    $('#university-error').hidden = false;
    console.error('大学設定の読み込みに失敗しました:', error);
  }
}

async function init(mode = state.mode) {
  const token = ++loadToken;
  const university = state.university;
  state.data = null;
  state.presentation = null;
  presentationPractice.reset();
  selectMode(mode);
  renderProgress();
  $('#category-nav').replaceChildren();
  $('#category-filter').replaceChildren(element('option', '', 'すべてのカテゴリ'));
  $('#category-filter').firstElementChild.value = 'all';
  $('#hero-category-count').textContent = '—';
  $('#hero-question-count').textContent = '—';
  $('#sidebar-category-count').textContent = '—';
  $('#visible-count').textContent = '—';
  $('#empty-state').hidden = true;
  $('#collection-end').hidden = true;
  $('.sample-notice').hidden = true;
  $('#question-list').setAttribute('aria-busy', 'true');
  $('#error-state').hidden = true;
  $('#question-list').replaceChildren(element('div', 'loading-state', '質問を読み込んでいます…'));
  const questionTask = (async () => {
   try {
    const data = await loadQuestions(new URL(university.questionsFile, dataDirectory));
    if (token !== loadToken) return;
    state.data = data;
    $('#hero-category-count').textContent = state.data.categories.length;
    $('#sidebar-category-count').textContent = state.data.categories.length;
    $('#hero-question-count').textContent = state.data.questions.length;
    const isDummy = state.data.isDummy !== false;
    $('.sample-notice').hidden = !isDummy;
    renderCategoryNav();
    renderProgress();
    renderList();
    if (!state.data.questions.length) {
      $('#empty-state h3').textContent = '質問データは準備中です';
      $('#empty-state p').textContent = '質問が追加されると、ここに一覧が表示されます。';
      $('#empty-reset').hidden = true;
    } else {
      $('#empty-state h3').textContent = '該当する質問がありません';
      $('#empty-state p').textContent = 'キーワードや絞り込み条件を変えてみてください。';
      $('#empty-reset').hidden = false;
    }
    $('#interview-tab span').textContent = `想定質問${data.questions.length}問と回答練習`;
    if (!store.available) showNotice('学習状況を読み込めませんでした。保存設定をご確認ください。', true);
  } catch (error) {
    if (token !== loadToken) return;
    $('#question-list').replaceChildren();
    $('#error-state').hidden = false;
    $('#error-state h3').textContent = `${university.name}の質問データを読み込めませんでした`;
    console.error('質問の読み込みに失敗しました:', error);
  } finally {
    if (token === loadToken) {
      $('#question-list').setAttribute('aria-busy', 'false');
      updatePracticeButton();
    }
  }
  })();
  const presentationTask = (async () => {
    if (!university.presentationFile) return;
    $('#presentation-loading').hidden = false;
    $('#presentation-panel').setAttribute('aria-busy', 'true');
    try {
      const data = await loadPresentation(new URL(university.presentationFile, dataDirectory));
      if (token !== loadToken) return;
      state.presentation = data;
      presentationPractice.render(data);
    } catch (error) {
      if (token !== loadToken) return;
      $('#presentation-error').hidden = false;
      console.error('プレゼン原稿の読み込みに失敗しました:', error);
    } finally {
      if (token === loadToken) {
        $('#presentation-loading').hidden = true;
        $('#presentation-panel').setAttribute('aria-busy', 'false');
        updatePracticeButton();
      }
    }
  })();
  await Promise.allSettled([questionTask, presentationTask]);
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
$('#retry-load').addEventListener('click', () => init());
$('#retry-presentation').addEventListener('click', () => init());
$('#retry-universities').addEventListener('click', boot);
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.mode)));
enableTabKeyboard($('#university-tabs'));
enableTabKeyboard($('#mode-tabs'));
$('#start-practice').addEventListener('click', () => {
  if (state.mode === 'presentation') {
    if (!state.presentation) return;
    presentationPractice.start();
    $('#timer-start').focus({ preventScroll: true });
    $('#presentation-panel').scrollIntoView({ behavior: 'instant', block: 'start' });
    return;
  }
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
  for (const item of stores.values()) {
    if (event.key === item.key || event.key === null) item.load();
  }
  if (store && (event.key === store.key || event.key === null) && state.data) {
    renderProgress();
    document.querySelectorAll('.question-card').forEach(card => {
      const question = state.data.questions.find(question => question.id === card.dataset.questionId);
      if (question) updateCardStatus(card, question);
    });
  }
});
boot();
