import {
  QUESTION_WORDING_POLICY,
  QuestionWordingService,
} from './question-wording.service';

describe('QuestionWordingService', () => {
  const service = new QuestionWordingService();

  it('counts Arabic and English words', () => {
    expect(service.countWords('ما اسم قائد فريق سبعة في ناروتو؟')).toBe(7);
    expect(service.countWords('Which team did Lionel Messi play for?')).toBe(7);
  });

  it('accepts a concise playable Arabic question', () => {
    expect(
      service.validate(
        'ما التقنية التي يستخدمها كاكاشي لنسخ تقنيات خصومه؟',
        'الشارينغان',
      ).issues,
    ).toEqual([]);
  });

  it('detects academic, parenthetical, explanatory, and multi-sentence wording', () => {
    const result = service.validate(
      'بناءً على ما سبق، ما التقنية المستخدمة (مثل التقنية الشهيرة)؟ حيث إنها تنسخ قدرات الخصم؟',
      'الشارينغان',
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'QUESTION_MULTIPLE_IDEAS',
        'QUESTION_ACADEMIC_STYLE',
        'QUESTION_CONTAINS_EXPLANATION',
        'QUESTION_CONTAINS_PARENTHESES',
      ]),
    );
  });

  it('detects hard word and character limits', () => {
    const long = `${Array(QUESTION_WORDING_POLICY.ar.hardMax + 1)
      .fill('كلمة')
      .join(' ')}؟`;
    expect(service.validate(long, 'إجابة').issues).toEqual(
      expect.arrayContaining(['QUESTION_TOO_LONG', 'QUESTION_MULTIPLE_IDEAS']),
    );
  });

  it('detects answer leakage and vague questions', () => {
    expect(
      service.validate('هل الإجابة هي كاكاشي؟', 'كاكاشي').issues,
    ).toContain('QUESTION_ANSWER_LEAKAGE');
    expect(service.validate('من هذا؟', 'كاكاشي').issues).toContain(
      'QUESTION_VAGUE',
    );
  });

  it('detects robotic translated riddle wording', () => {
    expect(
      service.validate(
        'من هو الإستراتيجي الذي يمتلك عيونًا استثنائية ويتمتع بذاكرة قوية لقراءة الأحداث الماضية؟',
        'الغراب ذو العيون الثلاثة',
      ).issues,
    ).toContain('QUESTION_ROBOTIC_RIDDLE_STYLE');
    expect(
      service.validate(
        'من الشخصية التي ترتبط دائمًا بالأسرار ويظهر خلف الكواليس؟',
        'فاريس',
      ).issues,
    ).toContain('QUESTION_ROBOTIC_RIDDLE_STYLE');
  });

  it('accepts more human host-style wording', () => {
    expect(
      service.validate('مين معروف بدهائه وشغله من وراء الستار؟', 'فاريس')
        .issues,
    ).toEqual([]);
  });

  it('only removes obvious framing and parentheses in deterministic fallback', () => {
    expect(
      service.safelyShorten(
        'في عالم ناروتو، ما التقنية التي يستخدمها كاكاشي (النينجا الناسخ) لنسخ تقنيات خصومه؟',
      ),
    ).toBe('ما التقنية التي يستخدمها كاكاشي لنسخ تقنيات خصومه؟');
  });
});
