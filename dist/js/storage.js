import { STATUS } from './data.js';

export const STORAGE_KEY = 'senshu-interview:learning:v1';

/** Preserve unknown IDs and record fields for content updates and future notes. */
export class LearningStore {
  constructor(storage = window.localStorage) {
    this.storage = storage;
    this.records = Object.create(null);
    this.available = true;
    this.load();
  }

  load() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.version !== 1 || !data.questions || typeof data.questions !== 'object' || Array.isArray(data.questions)) {
        throw new Error('Unsupported learning data');
      }
      for (const [id, record] of Object.entries(data.questions)) {
        if (record && typeof record === 'object' && Object.hasOwn(STATUS, record.status)) {
          this.records[id] = { ...record };
        }
      }
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
    this.load();
    this.records[id] = { ...this.records[id], status, updatedAt: new Date().toISOString() };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, questions: this.records }));
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
