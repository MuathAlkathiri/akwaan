import { EntityFirstSearchPolicy } from '../application/entity-first-search.policy';

describe('EntityFirstSearchPolicy', () => {
  const policy = new EntityFirstSearchPolicy();

  it.each(['Deidara Uchiha', 'Jiraiya', 'Kakashi Hatake'])(
    'keeps every voice query bound to an alias for %s',
    (entity) => {
      const plan = policy.create({
        type: 'audio',
        canonicalEntity: entity,
        entity,
        aliases: entity === 'Deidara Uchiha' ? ['デイダラ', 'ديدارا'] : [],
        franchise: 'Naruto',
        context: 'sarcastic explosion speech',
      });
      const result = policy.queries(plan, [
        [entity, 'Naruto', 'voice'],
        [entity, 'Naruto', 'sarcastic speech'],
        ['sarcastic explosion speech'],
      ]);
      expect(result.queries).toHaveLength(2);
      expect(
        result.queries.every((query) =>
          plan.aliases.some((alias) =>
            query.toLocaleLowerCase().includes(alias.toLocaleLowerCase()),
          ),
        ),
      ).toBe(true);
      expect(result.rejectedCodes).toContain('SEARCH_CONTEXT_ONLY');
    },
  );

  it('accepts trusted original names but not semantic descriptions as aliases', () => {
    const plan = policy.create({
      type: 'audio',
      entity: 'Deidara Uchiha',
      aliases: ['explosive clay user', 'デイダラ', 'ديدارا'],
    });
    expect(plan.aliases).toEqual(
      expect.arrayContaining([
        'Deidara Uchiha',
        'Deidara',
        'デイダラ',
        'ديدارا',
      ]),
    );
    expect(plan.aliases).not.toContain('explosive clay user');
  });

  it('rejects missing entities, question text, descriptions, and unsafe legacy queries', () => {
    const missing = policy.create({ type: 'image', context: 'explosion art' });
    expect(policy.queries(missing, ['explosion art']).rejectedCodes).toContain(
      'SEARCH_ENTITY_REQUIRED',
    );
    const plan = policy.create({ type: 'image', entity: 'Deidara Uchiha' });
    expect(policy.validate(plan, 'Who uses explosive clay?')).toBe(
      'SEARCH_QUERY_IS_DESCRIPTION',
    );
    expect(policy.validate(plan, 'character who uses explosions')).toBe(
      'SEARCH_QUERY_IS_DESCRIPTION',
    );
    expect(
      policy.legacyQuery(plan, 'explosion motivational speech'),
    ).toBeUndefined();
  });

  it('rejects a fabricated cover location', () => {
    const plan = policy.create({
      type: 'image',
      entity: 'exploding ninja training ground',
      coverTopic: 'exploding ninja training ground',
      purpose: 'decorative',
    });
    expect(
      policy.validate(plan, 'exploding ninja training ground', 'cover'),
    ).toBe('SEARCH_QUERY_IS_DESCRIPTION');
  });
});
