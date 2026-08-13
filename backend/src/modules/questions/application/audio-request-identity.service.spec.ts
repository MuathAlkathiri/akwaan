import { AudioRequestIdentityService } from './audio-request-identity.service';
import { AudioQuestionKind } from '../schemas/question.schema';

describe('AudioRequestIdentityService', () => {
  const service = new AudioRequestIdentityService();

  it('normalizes request fields and changes the hash when search text changes', () => {
    const first = service.create(
      {
        kind: AudioQuestionKind.IDENTIFY_CHARACTER,
        searchQuery: '  Naruto   voice clip ',
        targetName: ' Naruto Uzumaki ',
        sourceTitle: ' Naruto ',
        language: 'JA',
      },
      1,
    );
    const second = service.create(
      { ...first, searchQuery: 'Naruto clean dialogue' },
      2,
    );
    expect(first.searchQuery).toBe('Naruto voice clip');
    expect(second.requestVersion).toBe(2);
    expect(second.requestHash).not.toBe(first.requestHash);
    expect(second.selectedCandidateId).toBeNull();
  });
});
