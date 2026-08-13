import { QuestionWriterAgentService } from './question-writer-agent.service';
import { categoryProfileRegistry } from './category-generation-profile.registry';

describe('QuestionWriterAgentService batch generation', () => {
  it('generates and reviews all homogeneous slots in one provider call', async () => {
    const generateStructured = jest.fn().mockResolvedValue({
      value: {
        items: [1, 2, 3].map((number) => ({
          slotId: `slot-${number}`,
          candidate: {
            question: `سؤال ${number}`,
            answer: `إجابة ${number}`,
            acceptedAnswers: [],
            wrongAnswers: [],
            difficulty: 'medium',
            gameMode: 'trivia',
            type: 'text',
            explanation: `شرح ${number}`,
            assetRequest: null,
            knowledgeFactIds: [],
            sourceIds: [],
          },
          review: { verdict: 'approved', score: 9, issues: [] },
        })),
      },
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      diagnostics: {
        usage: { promptTokens: 500, outputTokens: 900, totalTokens: 1400 },
      },
    });
    const writer = new QuestionWriterAgentService({
      generateStructured,
    } as never);

    const result = await writer.generateStandardBatch({
      categoryName: 'رياضة',
      slots: [1, 2, 3].map((number) => ({
        slotId: `slot-${number}`,
        difficulty: 'medium' as const,
        gameMode: 'trivia' as const,
        requestedAssetType: 'text' as const,
      })),
      profile: categoryProfileRegistry.byId('general-text-trivia'),
      requestedLanguage: 'ar',
      excludedQuestions: [],
    });

    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(result.requestCount).toBe(1);
    expect(result.value).toHaveLength(3);
    expect(result.diagnostics).toMatchObject({
      usage: { totalTokens: 1400 },
    });
  });
});
