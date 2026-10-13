import { STATUS } from './data.js?v=2';

export const STORAGE_KEY = 'senshu-interview:learning:v1';
export const UNIVERSITY_KEY = 'interview:last-university:v1';

export function getLearningStorageKey(university) {
  return university.storageKey || `interview:${university.id}:learning:v1`;
}

export function getSelectedUniversity(storage, fallback) {
  try { return storage.getItem(UNIVERSITY_KEY) || fallback; }
  catch { return fallback; }
}

export function saveSelectedUniversity(storage, id) {
  try { storage.setItem(UNIVERSITY_KEY, id); return true; }
  catch { return false; }
}

/** Preserve unknown IDs and record fields for content updates and future notes. */
export class LearningStore {
  constructor(storage = window.localStorage, key = STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
    this.records = Object.create(null);
    this.available = true;
    this.load();
  }

  load() {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) {
        this.records = Object.create(null);
        this.available = true;
        return;
      }
      const data = JSON.parse(raw);
      if (data.version !== 1 || !data.questions || typeof data.questions !== 'object' || Array.isArray(data.questions)) {
        throw new Error('Unsupported learning data');
      }
      const records = Object.create(null);
      for (const [id, record] of Object.entries(data.questions)) {
        if (record && typeof record === 'object' && Object.hasOwn(STATUS, record.status)) {
          records[id] = { ...record };
        }
      }
      this.records = records;
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  getStatus(id) {
    return this.records[id]?.status || 'unseen';
  }

  setStatus(id, status) {
    if (!Object.hasOwn(STATUS, status)) throw new Error('Unknown learning status');
    // Merge with the latest browser data to preserve updates from other tabs.
    if (this.available) this.load();
    this.records[id] = { ...this.records[id], status, updatedAt: new Date().toISOString() };
    try {
      this.storage.setItem(this.key, JSON.stringify({ version: 1, questions: this.records }));
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  getProgress(questions) {
    const counts = { unseen: 0, practicing: 0, ready: 0, total: questions.length, percent: 0 };
    for (const question of questions) counts[this.getStatus(question.id)]++;
    counts.percent = counts.total ? Math.round(counts.ready / counts.total * 100) : 0;
    return counts;
  }
}
