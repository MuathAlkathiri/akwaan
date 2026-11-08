import { candidateIdentityMetadata } from './candidate-identity-metadata';

describe('candidate identity metadata', () => {
  it('preserves draft fields and uses matching legacy authoring values when absent', () => {
    expect(
      candidateIdentityMetadata(
        { metadata: { subject: 'hero', notes: 'note' } },
        { subject: 'hero', entityId: 'hero-id' },
      ),
    ).toEqual({ subject: 'hero', notes: 'note', entityId: 'hero-id' });
  });
  it('fails closed when legacy authoring conflicts with draft identity', () => {
    expect(() =>
      candidateIdentityMetadata(
        { metadata: { entityId: 'one' } },
        { entityId: 'two' },
      ),
    ).toThrow('Conflicting candidate identity metadata');
  });
  it('does not invent optional identity fields', () => {
    expect(candidateIdentityMetadata({}, null)).toEqual({});
  });
  it('trims identity strings consistently with persisted ContentItem metadata', () => {
    expect(
      candidateIdentityMetadata(
        {
          metadata: {
            familyKey: ' family ',
            subject: ' hero ',
            entityId: ' id ',
            source: ' source ',
            tags: [' tag '],
          },
        },
        {
          familyKey: 'family',
          subject: 'hero',
          entityId: 'id',
          source: 'source',
          tags: [' tag '],
        },
      ),
    ).toEqual({
      familyKey: 'family',
      subject: 'hero',
      entityId: 'id',
      source: 'source',
      tags: [' tag '],
    });
    expect(() =>
      candidateIdentityMetadata(
        { metadata: { subject: ' hero ' } },
        { subject: 'other' },
      ),
    ).toThrow('Conflicting candidate identity metadata');
  });
});
