import { AudioSearchQueryBuilder } from './audio-search-query-builder.service';
import { AudioQuestionKind } from '../schemas/question.schema';

describe('AudioSearchQueryBuilder', () => {
  it('builds bounded multilingual character-specific queries', () => {
    const queries = new AudioSearchQueryBuilder().build({
      kind: AudioQuestionKind.IDENTIFY_CHARACTER,
      searchQuery: 'Naruto voice',
      targetName: 'Naruto Uzumaki',
      sourceTitle: 'Naruto',
      language: 'Japanese',
    });
    expect(queries).toHaveLength(6);
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining('voice clip clean dialogue'),
        expect.stringContaining('character voice'),
        expect.stringContaining('صوت شخصية'),
      ]),
    );
  });

  it('falls back to the search sentence alone when no target or source is supplied', () => {
    const queries = new AudioSearchQueryBuilder().build({
      kind: AudioQuestionKind.IDENTIFY_CHARACTER,
      searchQuery: 'مقطع صوتي لضحكة أوروتشيمارو المميزة',
    });
    expect(queries).toEqual(['مقطع صوتي لضحكة أوروتشيمارو المميزة']);
  });

  it('never emits a bare filler-keyword query for any kind without an anchor', () => {
    for (const kind of Object.values(AudioQuestionKind)) {
      const queries = new AudioSearchQueryBuilder().build({
        kind,
        searchQuery: 'sentence only',
      });
      expect(queries).toEqual(['sentence only']);
    }
  });
});
