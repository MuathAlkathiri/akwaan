import { AudioQuestionCatalogService } from './audio-question-catalog.service';
import { AudioQuestionKind } from '../schemas/question.schema';

describe('AudioQuestionCatalogService', () => {
  const service = new AudioQuestionCatalogService();

  it('normalizes existing song JSON into the generic audio request model', async () => {
    const entries = await service.loadLegacySongs();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toMatchObject({
      kind: AudioQuestionKind.IDENTIFY_SONG,
      question: 'ما اسم هذه الأغنية؟',
      audioRequest: {
        kind: AudioQuestionKind.IDENTIFY_SONG,
        language: 'ar',
        preferredDurationSeconds: 12,
      },
    });
  });

  it('normalizes non-song audio entries through the same model', () => {
    const [entry] = service.normalizeCatalog([
      {
        kind: 'identify_character',
        question: 'ما اسم هذه الشخصية؟',
        answer: 'كريتوس',
        acceptedAnswers: ['Kratos'],
        search: {
          query: 'Kratos voice line God of War',
          targetName: 'Kratos',
          sourceTitle: 'God of War',
          language: 'en',
        },
        clip: { durationSeconds: 8 },
      },
    ]);
    expect(entry.audioRequest).toMatchObject({
      kind: AudioQuestionKind.IDENTIFY_CHARACTER,
      preferredDurationSeconds: 8,
    });
  });
});
