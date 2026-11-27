import {
  MECHANIC_ANSWER_MODES,
  PROMPT_VERSIONS,
  promptVersionFor,
} from './generation-specification';
import {
  MEDIA_REQUIREMENTS,
  MediaRequirementEntry,
  mediaRequirementsDigest,
  resolveMediaRequirements,
} from './media-requirements';
import { evaluateCandidateMedia } from './candidate-media-plan';

describe('media requirements registry', () => {
  const scopes = [
    'observation-illusions',
    'assembly-rotation',
    'paths-motion',
    'any-scope',
  ];

  it('governs the two generatable mechanics that need a picture, so no other candidate is retroactively gated', () => {
    // القنبلة needs one everywhere; إكس أو المتحرك only in the three Scopes
    // that are visual by definition. The rest are text-only. One of them
    // drifting into this registry would gate approval on an asset nobody is
    // required to supply; this list changing is a decision, not a side effect.
    const governed = Object.keys(MECHANIC_ANSWER_MODES).filter((mechanicKey) =>
      scopes.some(
        (scopeKey) =>
          resolveMediaRequirements({ mechanicKey, scopeKey }).length > 0,
      ),
    );
    expect(governed).toEqual(['bomb', 'moving-xo']);
    expect(
      resolveMediaRequirements({
        mechanicKey: 'moving-xo',
        scopeKey: 'numbers-estimation',
      }),
    ).toEqual([]);
  });

  it('draws the Bomb picture in عالم الألغاز, and finds it everywhere else', () => {
    for (const scopeKey of [
      'observation-illusions',
      'wordplay-letters',
      'numbers-estimation',
      'assembly-rotation',
      'paths-motion',
      'spot-the-error',
    ]) {
      expect(
        resolveMediaRequirements({ mechanicKey: 'bomb', scopeKey }).map(
          (slot) => [slot.slotKey, slot.acquisition],
        ),
      ).toEqual([['item-image', ['upload', 'generate']]]);
    }
  });

  it('requires one real picture on every Bomb item outside عالم الألغاز', () => {
    for (const scopeKey of ['any-scope', 'football-clubs']) {
      expect(
        resolveMediaRequirements({ mechanicKey: 'bomb', scopeKey }),
      ).toEqual([
        {
          slotKey: 'item-image',
          purpose: 'gameplay',
          required: true,
          mediaType: 'image',
          targetPath: 'media',
          // Found or uploaded, never generated: the subject is real.
          acquisition: ['retrieve', 'upload'],
          aspectPolicy: 'native',
        },
      ]);
    }
  });

  it('versions the Bomb prompt apart from the other match mechanic', () => {
    // Two mechanics on one revision string would make a change to either look
    // like a change to both in every request hash and pinned plan.
    expect(promptVersionFor('bomb')).toBe('bomb-v3');
    expect(promptVersionFor('combo')).toBe(PROMPT_VERSIONS.match);
    expect(promptVersionFor('combo')).toBe('combo-v1');
    expect(promptVersionFor('read-your-opponent')).toBe('mc-v2');
    expect(promptVersionFor('closest')).toBe('closest-v3');
    expect(promptVersionFor('top-5')).toBeUndefined();
  });

  it('leaves generator prompt versions untouched (queued jobs keep their provenance)', () => {
    // A queued job carries the prompt version it was hashed with, so changing
    // either of these two silently invalidates its provenance. Authoring a new
    // mechanic adds a key; it must never rewrite one of these.
    expect(PROMPT_VERSIONS.multiple_choice).toBe('mc-v2');
    expect(PROMPT_VERSIONS.closest).toBe('closest-v3');
  });

  it('gives every authorable mechanic a prompt version', () => {
    // An answer mode with no version would build a specification whose
    // promptVersion is undefined, which validation then refuses — the job
    // would die at creation rather than at a reviewable boundary.
    for (const mode of Object.values(MECHANIC_ANSWER_MODES)) {
      expect(PROMPT_VERSIONS[mode]).toBeTruthy();
    }
  });

  it('applies scope-restricted entries only to their scopes', () => {
    expect(
      resolveMediaRequirements({
        mechanicKey: 'moving-xo',
        scopeKey: 'observation-illusions',
      }).map((slot) => slot.slotKey),
    ).toEqual(['puzzle-image']);
    expect(
      resolveMediaRequirements({
        mechanicKey: 'moving-xo',
        scopeKey: 'wordplay-letters',
      }),
    ).toEqual([]);
    expect(
      resolveMediaRequirements({ mechanicKey: 'moving-xo', scopeKey: null }),
    ).toEqual([]);
  });

  it('declares odd-piece V2 as an original plus a derived modified image', () => {
    const slots = resolveMediaRequirements({ mechanicKey: 'odd-piece' });
    expect(slots.map((slot) => slot.slotKey)).toEqual([
      'original-image',
      'modified-image',
    ]);
    expect(slots[1].derivedFromSlot).toBe('original-image');
    expect(slots[1].acquisition).toContain('edit');
  });

  it('never imposes 16:9 on gameplay media', () => {
    for (const entry of MEDIA_REQUIREMENTS) {
      for (const slot of entry.slots) {
        expect(slot.aspectPolicy).toBe('native');
      }
    }
  });

  it('fails loudly on a slot key declared twice for one target', () => {
    const registry: MediaRequirementEntry[] = [
      {
        mechanicKey: 'm',
        slots: [
          {
            slotKey: 'a',
            purpose: 'gameplay',
            required: true,
            mediaType: 'image',
            targetPath: 'media',
            acquisition: ['upload'],
            aspectPolicy: 'native',
          },
        ],
      },
      {
        mechanicKey: 'm',
        scopeKeys: ['s'],
        slots: [
          {
            slotKey: 'a',
            purpose: 'decorative',
            required: false,
            mediaType: 'image',
            targetPath: 'media',
            acquisition: ['upload'],
            aspectPolicy: 'native',
          },
        ],
      },
    ];
    expect(() =>
      resolveMediaRequirements({ mechanicKey: 'm', scopeKey: 's' }, registry),
    ).toThrow('MEDIA_REQUIREMENTS_DUPLICATE_SLOT');
  });

  it('computes an order-independent digest', () => {
    const slots = resolveMediaRequirements({ mechanicKey: 'odd-piece' });
    expect(mediaRequirementsDigest(slots)).toBe(
      mediaRequirementsDigest([...slots].reverse()),
    );
    expect(mediaRequirementsDigest(slots)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('describes each slot for the review surface, including what upload cannot fill', () => {
    const describe = (mechanicKey: string, scopeKey?: string) =>
      evaluateCandidateMedia({ mechanicKey, scopeKey }).slots;
    expect(describe('ekshifni')).toEqual([
      {
        slotKey: 'subject-image',
        purpose: 'gameplay',
        required: true,
        mediaType: 'image',
        uploadSupported: true,
        uploadUnsupportedReason: null,
      },
    ]);
    expect(describe('first-note')[0]).toMatchObject({
      mediaType: 'audio',
      uploadSupported: false,
      uploadUnsupportedReason: 'AUDIO_UPLOAD_NOT_SUPPORTED',
    });
    expect(
      describe('odd-piece').map((slot) => slot.uploadUnsupportedReason),
    ).toEqual([
      'ODD_PIECE_V2_IMAGE_FIELDS_NOT_SUPPORTED',
      'ODD_PIECE_V2_IMAGE_FIELDS_NOT_SUPPORTED',
    ]);
    expect(describe('read-your-opponent', 'any')).toEqual([]);
  });
});
