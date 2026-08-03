import { ChallengePresentationPolicy } from './challenge-presentation.policy';
import { presentation } from './world-content.fixtures';

describe('ChallengePresentationPolicy', () => {
  const policy = new ChallengePresentationPolicy();

  const codes = (value: Parameters<typeof policy.validateShape>[0]) =>
    policy.validateShape(value).map((problem) => problem.code);

  it('accepts a well-formed mechanic presentation', () => {
    expect(policy.validateShape(presentation())).toEqual([]);
  });

  it('rejects a free-text input identifier', () => {
    expect(codes(presentation({ inputType: 'Phone Multiple Choice' }))).toEqual(
      ['INVALID_PRESENTATION_INPUT_TYPE'],
    );
  });

  it('accepts a null timer but rejects an out-of-range one', () => {
    expect(codes(presentation({ timerSeconds: null }))).toEqual([]);
    expect(codes(presentation({ timerSeconds: 0 }))).toEqual([
      'INVALID_PRESENTATION_TIMER',
    ]);
    expect(codes(presentation({ timerSeconds: 601 }))).toEqual([
      'INVALID_PRESENTATION_TIMER',
    ]);
  });

  it('rejects sound pack and reveal style values that are not identifiers', () => {
    expect(codes(presentation({ revealStyle: 'Slow Fade' }))).toEqual([
      'INVALID_PRESENTATION_IDENTIFIER',
    ]);
    expect(codes(presentation({ soundPack: null }))).toEqual([]);
  });

  it('reports a missing presentation as invalid instead of throwing', () => {
    expect(() => policy.validateShape(undefined)).not.toThrow();
    expect(codes(undefined)).toEqual(
      expect.arrayContaining(['INVALID_PRESENTATION_INPUT_TYPE']),
    );
  });

  it('carries no media rule at all: media belongs to the ContentItem', () => {
    // A mechanic never declares a medium, so text, image, audio, and video
    // content all play through the same configuration.
    expect(Object.keys(presentation())).not.toContain('mediaType');
  });
});
