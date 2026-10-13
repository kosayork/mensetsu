import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadQuestions, filterQuestions } from '../dist/js/data.js';
import { LearningStore, STORAGE_KEY } from '../dist/js/storage.js';

const data = JSON.parse(await readFile(new URL('../dist/data/questions.json', import.meta.url), 'utf8'));
function memoryStorage(initial = null) {
  let raw = initial;
  return { getItem: () => raw, setItem: (key, value) => { assert.equal(key, STORAGE_KEY); raw = value; } };
}

test('sample data has 50 unique questions across eight categories and passes runtime validation', async () => {
  assert.equal(data.questions.length, 50);
  assert.equal(data.categories.length, 8);
  assert.equal(new Set(data.questions.map(q => q.id)).size, 50);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => data });
    assert.equal((await loadQuestions()).questions.length, 50);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...data, questions: [data.questions[0], data.questions[0]] }) });
    await assert.rejects(loadQuestions(), /Invalid question/);
  } finally { globalThis.fetch = originalFetch; }
});

test('category, importance and normalized search filters combine and preserve original IDs', () => {
  const result = filterQuestions(data.questions, { category: 'motivation', importance: 'A', search: '専修大学' });
  assert.deepEqual(result.map(q => q.id), ['q001']);
  assert.equal(filterQuestions(data.questions, { search: 'ＰＲＯＧＲＡＭＭＩＮＧ' }).length, 0);
  assert.equal(filterQuestions([{ question: 'AI の利用', categoryId: 'society', importance: 'A', id: 'test' }], { search: 'ａｉ 利用' }).length, 1);
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
  const changed = [...data.questions].reverse().map(q => ({ ...q, question: '更新済みの質問' }));
  assert.deepEqual(restored.getProgress(changed), { ready: 1, practicing: 1, unseen: 48, total: 50, percent: 2 });
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
