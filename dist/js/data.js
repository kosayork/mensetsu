export const STATUS = Object.freeze({
  unseen: { label: '未着手', className: 'unseen' },
  practicing: { label: '練習中', className: 'practicing' },
  ready: { label: '回答できる', className: 'ready' },
});

/** All content comes from JSON. IDs are durable keys, independent of ordering. */
export async function loadJSON(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Data: HTTP ${response.status}`);
  return response.json();
}

export async function loadQuestions(url = new URL('../data/senshu.json', import.meta.url)) {
  const data = await loadJSON(url);
  if (!Array.isArray(data.categories) || !Array.isArray(data.questions)) {
    throw new Error('Question data must contain categories and questions arrays.');
  }
  const categoryIds = new Set();
  for (const category of data.categories) {
    if (typeof category.id !== 'string' || !category.id || categoryIds.has(category.id) || typeof category.name !== 'string') {
      throw new Error('Invalid or duplicate category ID.');
    }
    categoryIds.add(category.id);
  }
  const ids = new Set();
  for (const question of data.questions) {
    if (typeof question.id !== 'string' || !question.id || ids.has(question.id)
      || !categoryIds.has(question.categoryId) || !['A', 'B', 'C'].includes(question.importance)
      || typeof question.question !== 'string' || typeof question.exampleAnswer !== 'string'
      || !Array.isArray(question.points) || !question.points.every(point => typeof point === 'string')
      || !Array.isArray(question.followUps) || !question.followUps.every(point => typeof point === 'string')) {
      throw new Error('Invalid question record or duplicate question ID.');
    }
    ids.add(question.id);
  }
  return data;
}

export async function loadUniversities(url = new URL('../data/universities.json', import.meta.url)) {
  const data = await loadJSON(url);
  if (!Array.isArray(data.universities) || !data.universities.length) throw new Error('No universities configured');
  const ids = new Set();
  const keys = new Set();
  for (const university of data.universities) {
    const key = university.storageKey || `interview:${university.id}:learning:v1`;
    if (typeof university.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(university.id)
      || ids.has(university.id) || keys.has(key)
      || ['name', 'faculty', 'questionsFile'].some(field => typeof university[field] !== 'string' || !university[field])
      || (university.presentationFile !== undefined && typeof university.presentationFile !== 'string')) {
      throw new Error('Invalid or duplicate university settings');
    }
    ids.add(university.id);
    keys.add(key);
  }
  if (!ids.has(data.defaultUniversityId)) throw new Error('Invalid default university');
  return data;
}

export async function loadPresentation(url) {
  const data = await loadJSON(url);
  if (!Number.isInteger(data.durationSeconds) || data.durationSeconds <= 0
    || typeof data.title !== 'string' || !Array.isArray(data.sections)
    || !data.sections.every(section => typeof section.heading === 'string' && typeof section.body === 'string')
    || !Array.isArray(data.points) || !data.points.every(point => typeof point === 'string')
    || !Array.isArray(data.cautions) || !data.cautions.every(point => typeof point === 'string')) {
    throw new Error('Invalid presentation data');
  }
  return data;
}

export function filterQuestions(questions, { category = 'all', importance = 'all', search = '' }) {
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ja');
  const terms = normalize(search.trim()).split(/\s+/).filter(Boolean);
  return questions.filter(question =>
    (category === 'all' || question.categoryId === category)
    && (importance === 'all' || question.importance === importance)
    && terms.every(term => normalize(question.question).includes(term)));
}
