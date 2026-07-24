import {
  mapOpenTriviaDbCategory,
  resolveOpenTriviaDbCategory,
} from './open-trivia-db-category.mapper';

describe('mapOpenTriviaDbCategory', () => {
  it.each([
    ['عام', 9],
    ['رياضة', 21],
    ['جغرافيا', 22],
    ['تاريخ', 23],
    ['علوم', 17],
    ['Music', 12],
    ['Video Games', 15],
  ])('maps %s safely', (name, id) =>
    expect(mapOpenTriviaDbCategory(name)).toBe(id),
  );
  it.each(['Naruto', 'كرة قدم عالمية', 'كأس العالم', 'Unknown'])(
    'does not broaden unsupported category %s',
    (name) => expect(mapOpenTriviaDbCategory(name)).toBeNull(),
  );
  it.each(['كرة قدم عالمية', 'كأس العالم', 'world-football'])(
    'resolves %s to filtered Sports collection',
    (name) =>
      expect(resolveOpenTriviaDbCategory(name)).toEqual({
        category: 21,
        topicFilter: 'football',
      }),
  );
  it('does not resolve an unrelated specific category', () =>
    expect(resolveOpenTriviaDbCategory('Naruto')).toBeNull());
});
