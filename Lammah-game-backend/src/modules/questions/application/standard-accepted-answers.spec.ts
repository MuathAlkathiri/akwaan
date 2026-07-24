import { sanitizeStandardAcceptedAnswers } from '../questions.service';

describe('sanitizeStandardAcceptedAnswers', () => {
  it('removes blanks, canonical equivalents, and normalized duplicates', () => {
    expect(
      sanitizeStandardAcceptedAnswers(
        [' السعودية ', 'السُّعُودِيَّة', 'KSA', 'ksa', '  '],
        'المملكة العربية السعودية',
      ),
    ).toEqual(['السعودية', 'KSA']);
  });

  it('keeps legacy questions without aliases unchanged', () => {
    expect(
      sanitizeStandardAcceptedAnswers(undefined, 'answer'),
    ).toBeUndefined();
  });
});
