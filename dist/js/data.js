export const STATUS = Object.freeze({
  unseen: { label: '未着手', className: 'unseen' },
  practicing: { label: '練習中', className: 'practicing' },
  ready: { label: '回答できる', className: 'ready' },
});

/** All content comes from JSON. IDs are durable keys, independent of ordering. */
export async function loadQuestions(url = new URL('../data/questions.json', import.meta.url)) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Question data: HTTP ${response.status}`);
  const data = await response.json();
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

export function filterQuestions(questions, { category = 'all', importance = 'all', search = '' }) {
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ja');
  const terms = normalize(search.trim()).split(/\s+/).filter(Boolean);
  return questions.filter(question =>
    (category === 'all' || question.categoryId === category)
    && (importance === 'all' || question.importance === importance)
    && terms.every(term => normalize(question.question).includes(term)));
}
