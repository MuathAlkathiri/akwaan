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
});
