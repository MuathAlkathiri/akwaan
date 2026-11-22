import { fileSlug, parseArguments, throttleWaitMs } from './discover-media';

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

describe('throttleWaitMs', () => {
  it('waits as long as the server asked, up to a minute', () => {
    expect(throttleWaitMs(0, 17)).toBe(17_000);
    expect(throttleWaitMs(1, 900)).toBe(60_000);
  });

  it('backs off on its own when the server gave no time', () => {
    expect(throttleWaitMs(0, undefined)).toBe(10_000);
    expect(throttleWaitMs(1, undefined)).toBe(30_000);
  });

  it('gives up after two retries', () => {
    expect(throttleWaitMs(2, undefined)).toBeNull();
    expect(throttleWaitMs(2, 5)).toBeNull();
  });
});
