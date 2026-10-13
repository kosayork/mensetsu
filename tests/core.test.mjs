import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadQuestions, filterQuestions, loadUniversities, loadPresentation } from '../dist/js/data.js';
import { LearningStore, STORAGE_KEY, UNIVERSITY_KEY, getLearningStorageKey, getSelectedUniversity, saveSelectedUniversity } from '../dist/js/storage.js';
import { PresentationTimer, formatTime } from '../dist/js/timer.js';

const data = JSON.parse(await readFile(new URL('../dist/data/senshu.json', import.meta.url), 'utf8'));
function memoryStorage(initial = null) {
  const values = new Map(initial ? [[STORAGE_KEY, initial]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('question data passes runtime validation and duplicate IDs are rejected', async () => {
  assert.ok(data.questions.length > 0, 'At least one question is required');
  assert.ok(data.categories.length > 0, 'At least one category is required');
  assert.equal(new Set(data.questions.map(q => q.id)).size, data.questions.length);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => data });
    assert.equal((await loadQuestions()).questions.length, data.questions.length);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...data, questions: [data.questions[0], data.questions[0]] }) });
    await assert.rejects(loadQuestions(), /Invalid question/);
  } finally { globalThis.fetch = originalFetch; }
});

test('category, importance and normalized search filters combine and preserve original IDs', () => {
  const questions = [
    { id: 'filter-1', categoryId: 'motivation', importance: 'A', question: '専修大学を志望した理由' },
    { id: 'filter-2', categoryId: 'motivation', importance: 'B', question: '専修大学で学びたいこと' },
    { id: 'filter-3', categoryId: 'society', importance: 'A', question: 'AI の利用' },
  ];
  const result = filterQuestions(questions, { category: 'motivation', importance: 'A', search: '専修大学' });
  assert.deepEqual(result.map(q => q.id), ['filter-1']);
  assert.equal(filterQuestions(questions, { search: '該当しない文字列' }).length, 0);
  assert.deepEqual(filterQuestions(questions, { search: 'ａｉ 利用' }).map(q => q.id), ['filter-3']);
});

test('progress survives reload, reorder and content changes without losing future fields', () => {
  const storage = memoryStorage(JSON.stringify({ version: 1, questions: { archived: { status: 'ready' }, q001: { status: 'practicing', answerText: '本人の回答' } } }));
  const first = new LearningStore(storage);
  assert.equal(first.setStatus('q001', 'ready'), true);
  first.setStatus('q002', 'practicing');
  const restored = new LearningStore(storage);
  assert.equal(restored.getStatus('q001'), 'ready');
  assert.equal(restored.records.q001.answerText, '本人の回答');
  assert.equal(restored.getStatus('archived'), 'ready');
  assert.equal(restored.getStatus('new-id'), 'unseen');
  const original = [{ id: 'q001' }, { id: 'q002' }, { id: 'new-id' }];
  const changed = [...original].reverse().map(q => ({ ...q, question: '更新済みの質問' }));
  assert.deepEqual(restored.getProgress(changed), { ready: 1, practicing: 1, unseen: 1, total: 3, percent: 33 });
  assert.equal(restored.getProgress([]).percent, 0);
  restored.setStatus('q001', 'unseen');
  assert.equal(new LearningStore(storage).getProgress(changed).percent, 0);
});

test('unavailable or corrupt storage does not prevent in-memory practice', () => {
  const unavailable = new LearningStore({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.setStatus('q001', 'ready'), false);
  assert.equal(unavailable.getStatus('q001'), 'ready');
  assert.equal(new LearningStore(memoryStorage('{invalid')).available, false);
  assert.throws(() => unavailable.setStatus('q001', 'invalid'), /Unknown/);
});

test('the existing Senshu key and fields are retained; identical IDs stay independent', () => {
  const senshu = { id: 'senshu', storageKey: STORAGE_KEY };
  const kokugakuin = { id: 'kokugakuin' };
  const legacy = JSON.stringify({ version: 1, questions: { q001: { status: 'ready', answerText: '既存の回答', updatedAt: '2026-10-13' }, retired: { status: 'practicing' } } });
  const storage = memoryStorage(legacy);
  const first = new LearningStore(storage, getLearningStorageKey(senshu));
  const second = new LearningStore(storage, getLearningStorageKey(kokugakuin));
  assert.equal(first.getStatus('q001'), 'ready');
  assert.equal(second.getStatus('q001'), 'unseen');
  assert.equal(storage.getItem(STORAGE_KEY), legacy, 'Loading must not rewrite old data');
  second.setStatus('q001', 'practicing');
  assert.equal(storage.getItem(STORAGE_KEY), legacy, 'The other university must not touch old data');
  first.setStatus('q002', 'ready');
  const restored = new LearningStore(storage, STORAGE_KEY);
  assert.equal(restored.records.q001.answerText, '既存の回答');
  assert.equal(restored.getStatus('retired'), 'practicing');
  assert.equal(new LearningStore(storage, getLearningStorageKey(kokugakuin)).getStatus('q001'), 'practicing');
});

test('the last university is restored and storage failures have a safe fallback', () => {
  const storage = memoryStorage();
  assert.equal(getSelectedUniversity(storage, 'senshu'), 'senshu');
  assert.equal(saveSelectedUniversity(storage, 'kokugakuin'), true);
  assert.equal(storage.getItem(UNIVERSITY_KEY), 'kokugakuin');
  assert.equal(getSelectedUniversity(storage, 'senshu'), 'kokugakuin');
  const unavailable = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.equal(getSelectedUniversity(unavailable, 'senshu'), 'senshu');
  assert.equal(saveSelectedUniversity(unavailable, 'kokugakuin'), false);
});

test('failed writes retain all in-memory answers until storage recovers', () => {
  const storage = memoryStorage();
  const originalSet = storage.setItem;
  storage.setItem = () => { throw Error('quota'); };
  const store = new LearningStore(storage);
  assert.equal(store.setStatus('q001', 'ready'), false);
  assert.equal(store.setStatus('q002', 'practicing'), false);
  assert.equal(store.getStatus('q001'), 'ready');
  assert.equal(store.getStatus('q002'), 'practicing');
  storage.setItem = originalSet;
  assert.equal(store.setStatus('q003', 'ready'), true);
  assert.equal(new LearningStore(storage).getStatus('q001'), 'ready');
});

test('both configured question files and the presentation load with the shared schema', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(await readFile(new URL(url), 'utf8')) });
    const config = await loadUniversities();
    assert.ok(config.universities.length > 0);
    for (const university of config.universities) {
      const questions = await loadQuestions(new URL(`../dist/data/${university.questionsFile}`, import.meta.url));
      assert.ok(Array.isArray(questions.questions));
      if (university.presentationFile) {
        const script = await loadPresentation(new URL(`../dist/data/${university.presentationFile}`, import.meta.url));
        assert.ok(script.durationSeconds > 0);
        assert.ok(Array.isArray(script.sections));
      }
    }
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ schemaVersion: 1, categories: [], questions: [] }) });
    assert.equal((await loadQuestions()).questions.length, 0, 'Empty future question data is supported');
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    await assert.rejects(loadQuestions(), /HTTP 404/);
    await assert.rejects(loadPresentation('missing'), /HTTP 404/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ durationSeconds: -1 }) });
    await assert.rejects(loadPresentation('invalid'), /Invalid presentation/);
  } finally { globalThis.fetch = originalFetch; }
});

test('the five-minute timer handles pause, resume, long background gaps, finish and reset', () => {
  let now = 0;
  const timer = new PresentationTimer(300, () => now);
  assert.equal(formatTime(timer.remainingSeconds), '05:00');
  timer.start();
  now = 1550;
  assert.equal(timer.remainingSeconds, 299);
  timer.pause();
  now = 90000;
  assert.equal(timer.remainingSeconds, 299, 'Paused time must not count');
  timer.start();
  now += 120000;
  assert.equal(timer.remainingSeconds, 179, 'Use elapsed time instead of interval tick count');
  now += 300000;
  assert.equal(timer.remainingSeconds, 0);
  assert.equal(timer.running, false);
  timer.start();
  assert.equal(timer.running, false, 'Finished timer must wait for reset');
  timer.reset();
  assert.equal(timer.remainingSeconds, 300);
  assert.equal(timer.running, false);
});
