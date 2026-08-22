import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlayerInstructionsDto } from './world-content-shared.dto';

/**
 * The request-body guarantees for authored player instructions. These run at the
 * edge, before anything is persisted, so an author cannot save a shape the
 * projection could not render — an empty summary, a blank step, or more steps
 * than the board will show.
 */
describe('PlayerInstructionsDto', () => {
  const build = (value: unknown) =>
    validate(plainToInstance(PlayerInstructionsDto, value));

  it('accepts a summary with ordered steps and optional highlights', async () => {
    const dto = plainToInstance(PlayerInstructionsDto, {
      summary: '  اقرأ خصمك.  ',
      steps: ['  اختر توقعك  ', 'اكشفوا معًا'],
      highlights: ['لا تكشف مبكرًا'],
    });
    await expect(validate(dto)).resolves.toEqual([]);
    // The trimming transform runs as part of validation.
    expect(dto.summary).toBe('اقرأ خصمك.');
    expect(dto.steps).toEqual(['اختر توقعك', 'اكشفوا معًا']);
  });

  it('accepts a summary with steps and no highlights', async () => {
    await expect(build({ summary: 'ملخص', steps: ['خطوة'] })).resolves.toEqual(
      [],
    );
  });

  it('rejects an empty or whitespace-only summary', async () => {
    expect(await build({ summary: '   ', steps: ['خطوة'] })).not.toHaveLength(
      0,
    );
  });

  it('rejects a whitespace-only step', async () => {
    expect(
      await build({ summary: 'ملخص', steps: ['خطوة', '   '] }),
    ).not.toHaveLength(0);
  });

  it('rejects more than the eight steps the board can show', async () => {
    const steps = Array.from({ length: 9 }, (_, i) => `خطوة ${i + 1}`);
    expect(await build({ summary: 'ملخص', steps })).not.toHaveLength(0);
  });

  it('rejects more than five highlights', async () => {
    const highlights = Array.from({ length: 6 }, (_, i) => `ملاحظة ${i + 1}`);
    expect(
      await build({ summary: 'ملخص', steps: ['خطوة'], highlights }),
    ).not.toHaveLength(0);
  });
});
