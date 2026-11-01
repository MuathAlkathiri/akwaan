import {
  numbersInPrompt,
  numericLeakageSignals,
  optionLeakageSignals,
  withoutAttachedArticle,
} from './answer-leakage.policy';

const codes = (signals: Array<{ code: string; certainty: string }>) =>
  signals.map((signal) => `${signal.certainty}:${signal.code}`);

describe('numbersInPrompt', () => {
  it.each([
    ['العدد 1,024', [1024]],
    ['العدد ١٬٠٢٤', [1024]],
    ['العدد ١٠٢٤', [1024]],
    ['ألف وأربعة وعشرون', [1024]],
    ['ثلاثة آلاف وخمسمئة', [3500]],
    ['ألفان ومئة', [2100]],
    ['خمسة وتسعون', [95]],
    ['12 لاعبًا و 40 مباراة', [12, 40]],
    ['سؤال بلا أرقام', []],
  ])('reads %s', (prompt, expected) => {
    expect(numbersInPrompt(prompt)).toEqual(expected);
  });
});

describe('withoutAttachedArticle', () => {
  it.each([
    ['بالاسد', 'اسد'],
    ['والاسد', 'اسد'],
    ['للاسد', 'اسد'],
    ['كالاسد', 'اسد'],
    ['الاسد', 'اسد'],
  ])('folds %s', (token, expected) => {
    expect(withoutAttachedArticle(token)).toBe(expected);
  });

  it('leaves words that only look prefixed', () => {
    expect(withoutAttachedArticle('كريم')).toBe('كريم');
    expect(withoutAttachedArticle('الف')).toBe('الف');
  });
});

describe('numericLeakageSignals', () => {
  it.each([
    ['العدد 1,024 يساوي كم؟', 1024],
    ['العدد ١٬٠٢٤ يساوي كم؟', 1024],
    ['ألف وأربعة وعشرون هو كم؟', 1024],
    ['خمسة وتسعون نقطة كم تساوي؟', 95],
  ])('blocks "%s"', (prompt, target) => {
    expect(codes(numericLeakageSignals(prompt, target))).toEqual([
      'certain:ANSWER_LEAKAGE',
    ]);
  });

  it.each([
    ['صندوق فيه 12 صفًا في كل صف 12 علبة، كم علبة في الصندوق؟', 144],
    ['خمّن ناتج 12 × 12.', 144],
    ['ما مجموع 40 و 56؟', 96],
    ['فاز بـ 40 مباراة، بمعدل 3 نقاط لكل فوز، كم نقطة جمع؟', 120],
    ['سجل ضعف 48 هدفًا، كم هدفًا سجل؟', 96],
  ])('blocks the worksheet "%s"', (prompt, target) => {
    expect(codes(numericLeakageSignals(prompt, target))).toEqual([
      'certain:ANSWER_DERIVABLE',
    ]);
  });

  it('only warns about a sum with no operation named', () => {
    expect(
      codes(
        numericLeakageSignals('كم عدد اللاعبين الكلي في مباراة (6 ضد 6)؟', 12),
      ),
    ).toEqual(['possible:POSSIBLE_ANSWER_LEAKAGE']);
  });

  it('only warns on a reasoning item, which is meant to be worked out', () => {
    expect(
      codes(
        numericLeakageSignals(
          'صندوق فيه 12 صفًا في كل صف 12 علبة، كم علبة؟',
          144,
          { reasoning: true },
        ),
      ),
    ).toEqual(['possible:POSSIBLE_ANSWER_LEAKAGE']);
  });

  it('only warns about a small number written as a word', () => {
    expect(
      codes(numericLeakageSignals('كم لقبًا حقق في أول خمس نسخ؟', 5)),
    ).toEqual(['possible:POSSIBLE_ANSWER_LEAKAGE']);
  });

  it('does not read a year or a season as arithmetic', () => {
    expect(
      numericLeakageSignals('كم نقطة حقق الهلال في موسم 2023–24؟', 2047),
    ).toEqual([]);
  });

  it('stays quiet on a long sequence, where some pair always fits', () => {
    expect(
      numericLeakageSignals('ما التالي: 2, 3, 5, 7, 11, 13, 17؟', 19),
    ).toEqual([]);
  });

  it('passes an estimate that shares nothing with the answer', () => {
    expect(
      numericLeakageSignals('كم نقطة حقق الهلال بطلًا موسم 2023–24؟', 96),
    ).toEqual([]);
  });
});

describe('optionLeakageSignals', () => {
  const others = ['نمر', 'فهد', 'ذئب'];

  it('warns on a broken plural of the answer', () => {
    expect(
      codes(optionLeakageSignals('ما ملك الغابة من الأسود؟', 'أسد', others)),
    ).toEqual(['possible:POSSIBLE_ANSWER_LEAKAGE']);
  });

  it('warns on an attached preposition, without blocking a name', () => {
    expect(
      codes(optionLeakageSignals('من لعب لهجر موسم 2014؟', 'هجر', others)),
    ).toEqual(['possible:POSSIBLE_ANSWER_LEAKAGE']);
    expect(optionLeakageSignals('من هو كريم بنزيما؟', 'ريم', others)).toEqual(
      [],
    );
  });

  it('warns on a nisba of the answer', () => {
    expect(
      codes(
        optionLeakageSignals('من قاد المنتخب الأرجنتيني؟', 'الأرجنتين', [
          'البرازيل',
          'فرنسا',
        ]),
      ),
    ).toContain('possible:POSSIBLE_ANSWER_LEAKAGE');
  });

  it('warns when only the correct option echoes the question', () => {
    expect(
      codes(
        optionLeakageSignals(
          'ما الظاهرة التي ينبعث منها شرر أسود؟',
          'الوميض الأسود',
          ['الضربة القاضية', 'القبضة الحديدية'],
        ),
      ),
    ).toContain('possible:POSSIBLE_ANSWER_LEAKAGE');
  });

  it('stays quiet when every option shares the word', () => {
    expect(
      optionLeakageSignals('أي فريق من مدريد فاز؟', 'ريال مدريد', [
        'أتلتيكو مدريد',
        'رايو مدريد',
      ]).filter((signal) => signal.message.includes('only the correct')),
    ).toEqual([]);
  });

  it('warns when grammar leaves one option standing', () => {
    expect(
      codes(
        optionLeakageSignals('ما هي الكلمة التي تعني ملكًا؟', 'شجرة', [
          'كتاب',
          'قلم',
        ]),
      ),
    ).toContain('possible:GRAMMAR_NARROWS_OPTIONS');
  });

  it('checks a numeric option like a number', () => {
    expect(
      codes(
        optionLeakageSignals('العدد ١٬٠٢٤ يساوي كم؟', '1024', ['12', '40']),
      ),
    ).toEqual(['certain:ANSWER_LEAKAGE']);
  });

  it('cannot see a clue that needs world knowledge', () => {
    expect(
      optionLeakageSignals('ما عاصمة فرنسا، مدينة برج إيفل واللوفر؟', 'باريس', [
        'ليون',
        'مرسيليا',
      ]),
    ).toEqual([]);
  });

  it('passes a clean question', () => {
    expect(
      optionLeakageSignals('ضد أي فريق سجل عمر السومة أول هاتريك؟', 'هجر', [
        'الفتح',
        'الرائد',
      ]),
    ).toEqual([]);
  });
});
