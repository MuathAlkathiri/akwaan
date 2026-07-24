import { QuestionDuplicateDetectionService } from './question-duplicate-detection.service';

describe('QuestionDuplicateDetectionService', () => {
  const repository = { findDuplicateCandidates: jest.fn() };
  const service = new QuestionDuplicateDetectionService(repository as never);

  beforeEach(() => jest.clearAllMocks());

  it('detects exact duplicates after Arabic and digit normalization', async () => {
    repository.findDuplicateCandidates.mockResolvedValue([
      {
        _id: '1',
        category: 'category-1',
        question: 'من هو بطل لعبة God of War؟ ١',
      },
    ]);
    const result = await service.check({
      question: 'مَن هُو بطل لعبه God of War؟ 1',
      categoryId: 'category-1',
    });
    expect(result.exactMatch).toBe(true);
    expect(result.highestSimilarity).toBe(1);
  });

  it('returns high-similarity warnings without coupling to generation agents', async () => {
    repository.findDuplicateCandidates.mockResolvedValue([
      {
        _id: '2',
        category: 'category-1',
        question: 'من هو بطل لعبة جاد أوف وار',
      },
    ]);
    const result = await service.check({
      question: 'من هو بطل لعبة جاد أوف وار؟',
      categoryId: 'category-1',
    });
    expect(result.matches).toHaveLength(1);
  });
});
