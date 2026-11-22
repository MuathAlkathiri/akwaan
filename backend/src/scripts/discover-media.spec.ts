import { fileSlug, parseArguments } from './discover-media';

describe('discover-media arguments', () => {
  it('reads the subject, alternatives and options', () => {
    expect(
      parseArguments([
        'Arsène',
        'Wenger',
        '--alt=أرسين فينغر',
        '--alt=Wenger Arsenal',
        '--limit=4',
        '--download',
      ]),
    ).toMatchObject({
      subject: 'Arsène Wenger',
      alternatives: ['أرسين فينغر', 'Wenger Arsenal'],
      limit: 4,
      download: true,
      json: false,
    });
  });

  it('is read-only unless --download is given, and leaves the limit to the service', () => {
    const args = parseArguments(['King Abdullah Sports City']);
    expect(args.download).toBe(false);
    expect(args).not.toHaveProperty('limit');
    expect(args.out.endsWith('ai/workbench/artifacts/handoff/images')).toBe(
      true,
    );
  });

  it('turns a subject into a file name the handoff tools accept', () => {
    expect(fileSlug('Arsène Wenger')).toBe('arsene-wenger');
    expect(fileSlug("N'Golo Kanté (2023)")).toBe('n-golo-kante-2023');
    expect(fileSlug('أرسين فينغر')).toBe('image');
  });
});
