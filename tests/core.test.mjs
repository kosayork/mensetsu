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
