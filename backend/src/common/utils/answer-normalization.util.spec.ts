import { normalizeAnswer } from './answer-normalization.util';

/**
 * Golden characterization of the canonical answer normalizer.
 *
 * Every row records what `normalizeAnswer` does *today*, including the cases
 * it does not fold. Those are pinned on purpose: this function also derives
 * content identity and duplicate detection, so any change to its output is a
 * versioned migration, never a side effect. A row marked "not folded" that a
 * future change flips must flip here, in review, with the identity impact
 * accounted for.
 */
describe('normalizeAnswer — golden behaviour', () => {
  describe('Arabic orthography it folds', () => {
    it.each([
      ['diacritics', 'الأَمَاكِن', 'اماكن'],
      ['shadda and harakat', 'مُحَمَّد', 'محمد'],
      ['hamza on alef above', 'أحمد', 'احمد'],
      ['hamza on alef below', 'إبراهيم', 'ابراهيم'],
      ['madda', 'آدم', 'ادم'],
      ['alef maqsura to yaa', 'مصطفى', 'مصطفي'],
      ['taa marbuta to haa', 'مدرسة', 'مدرسه'],
      ['tatweel', 'مـــدريد', 'مدريد'],
      ['presentation-form ligature', 'ﻻعب', 'لاعب'],
    ])('%s: %s → %s', (_case, input, expected) => {
      expect(normalizeAnswer(input)).toBe(expected);
    });
  });

  describe('Arabic orthography it does not fold (current gaps)', () => {
    it.each([
      ['hamza on waw', 'مسؤول', 'مسوول'],
      ['hamza on yaa', 'مسئول', 'مسيول'],
      ['alef wasla', 'ٱلله', 'ٱلله'],
    ])('%s: %s → %s', (_case, input, expected) => {
      expect(normalizeAnswer(input)).toBe(expected);
    });

    it('keeps the two hamza seats of one word different', () => {
      expect(normalizeAnswer('مسؤول')).not.toBe(normalizeAnswer('مسئول'));
    });
  });

  describe('the definite article', () => {
    it.each([
      ['a leading ال is dropped', 'العالم', 'عالم'],
      ['only on the first word', 'كأس العالم', 'كاس العالم'],
      ['only on the first word, twice', 'البيت الأبيض', 'بيت الابيض'],
      ['a bare ال is kept', 'ال', 'ال'],
      ['ال followed by a space is kept', 'ال صياد', 'ال صياد'],
      ['including where it is part of the word', 'الله', 'له'],
      ['a leading "the" is dropped', 'The Beatles', 'beatles'],
      ['a trailing "the" is kept', 'Beatles, The', 'beatles the'],
      ['only one leading "the"', 'the the', 'the'],
    ])('%s: %s → %s', (_case, input, expected) => {
      expect(normalizeAnswer(input)).toBe(expected);
    });

    it('does not make an article-less second word equal its article form', () => {
      expect(normalizeAnswer('كاس عالم')).not.toBe(
        normalizeAnswer('كأس العالم'),
      );
    });
  });

  describe('Latin text', () => {
    it.each([
      ['case', 'Hunter', 'hunter'],
      ['surrounding space', '  HUNTER  ', 'hunter'],
      ['accents', 'Pelé', 'pele'],
      ['full-width letters', 'Ｆｕｌｌ', 'full'],
    ])('%s: %s → %s', (_case, input, expected) => {
      expect(normalizeAnswer(input)).toBe(expected);
    });
  });

  describe('punctuation and symbols become spaces', () => {
    it.each([
      ['hyphen', 'Spider-Man', 'spider man'],
      ['dots', 'Real Madrid C.F.', 'real madrid c f'],
      ['slash', 'AC/DC', 'ac dc'],
      ['ampersand', 'R&B', 'r b'],
      ['Latin punctuation', 'Messi!', 'messi'],
      ['Arabic quotation marks', '«ميسي»', 'ميسي'],
      ['Arabic question mark', 'ميسي؟', 'ميسي'],
      ['hash', '#10', '10'],
      ['emoji', '😀ميسي', 'ميسي'],
    ])('%s: %s → %s', (_case, input, expected) => {
      expect(normalizeAnswer(input)).toBe(expected);
    });

    it('keeps a hyphenated name different from its joined spelling', () => {
      expect(normalizeAnswer('Spider-Man')).toBe(normalizeAnswer('spider man'));
      expect(normalizeAnswer('Spider-Man')).not.toBe(
        normalizeAnswer('Spiderman'),
      );
    });
  });

  describe('numbers', () => {
    it.each([
      ['Western digits', '2018', '2018'],
      ['Arabic-Indic digits are not folded', '٢٠١٨', '٢٠١٨'],
      ['Persian digits are not folded', '۲۰۱۸', '۲۰۱۸'],
      ['a decimal point splits', '3.14', '3 14'],
      ['a thousands separator splits', '1,000', '1 000'],
      ['digits inside a name', 'iPhone 15', 'iphone 15'],
      ['a game edition', 'FIFA 23', 'fifa 23'],
    ])('%s: %s → %s', (_case, input, expected) => {
      expect(normalizeAnswer(input)).toBe(expected);
    });

    it('keeps the same year in two digit systems different', () => {
      expect(normalizeAnswer('٢٠١٨')).not.toBe(normalizeAnswer('2018'));
    });
  });

  describe('whitespace and invisible characters', () => {
    it.each([
      ['no-break space collapses', 'ريال مدريد', 'ريال مدريد'],
      ['tab collapses', 'ريال\tمدريد', 'ريال مدريد'],
      // Format characters are not punctuation or space, so they survive.
      ['zero-width non-joiner is kept', 'ريال‌مدريد', 'ريال‌مدريد'],
      ['zero-width joiner is kept', 'ريال‍مدريد', 'ريال‍مدريد'],
      ['bidi embedding marks are kept', '‫ميسي‬', '‫ميسي‬'],
    ])('%s', (_case, input, expected) => {
      expect(normalizeAnswer(input)).toBe(expected);
    });

    it('treats an answer with an invisible joiner as a different answer', () => {
      expect(normalizeAnswer('ريال‌مدريد')).not.toBe(
        normalizeAnswer('ريال مدريد'),
      );
    });
  });

  describe('input that normalizes to nothing', () => {
    it.each([
      ['empty', ''],
      ['spaces only', '   '],
      ['punctuation only', '؟!'],
      ['tatweel only', 'ـ'],
    ])('%s', (_case, input) => {
      expect(normalizeAnswer(input)).toBe('');
    });
  });

  describe('multi-word answers', () => {
    it('collapses runs of space but keeps word boundaries', () => {
      expect(normalizeAnswer('  ريال   مدريد  ')).toBe('ريال مدريد');
      expect(normalizeAnswer('ريالمدريد')).not.toBe(
        normalizeAnswer('ريال مدريد'),
      );
    });

    it('keeps word order significant', () => {
      expect(normalizeAnswer('مدريد ريال')).not.toBe(
        normalizeAnswer('ريال مدريد'),
      );
    });
  });
});
