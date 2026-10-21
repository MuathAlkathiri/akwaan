import {
  RYO_GAMEPLAY_PLUGIN,
  RYO_REPLAY_COOLDOWN_SECONDS,
  ryoItemAudioUrl,
  ryoItemHasAudio,
} from './ryo-gameplay.plugin';
import type { GameplayModeState } from './gameplay-mode.plugin';

/**
 * The projections that make the audio barrier and the replay control honest.
 *
 * Three separate claims live here, and each one fails in a way the others would
 * not catch:
 *
 *  - `ryoItemHasAudio` decides whether item 2 or 3 raises a readiness barrier
 *    at all, so a false positive stalls a text question for no reason and a
 *    false negative leaves an audio question starting its clock on an unbuffered
 *    clip. It is the same predicate the replay command already gates on.
 *  - `ryoItemAudioUrl` is the *only* thing allowed through a raised barrier.
 *  - `projectPrompt` must stop handing every phone a URL that no phone plays.
 */
describe('RYO audio readiness projections', () => {
  const AUDIO = { type: 'audio', url: 'https://cdn/clip.mp3' };
  const IMAGE = { type: 'image', url: 'https://cdn/photo.png' };

  const teamActionJson = JSON.stringify({
    rotations: [
      { teamId: 'a', order: ['p'], cursor: 0 },
      { teamId: 'b', order: ['q'], cursor: 0 },
    ],
    assignments: [
      { teamId: 'a', participantId: 'p', action: 'ryo.answer', sequence: 1 },
      { teamId: 'b', participantId: 'q', action: 'ryo.decision', sequence: 2 },
    ],
    nextSequence: 3,
  });

  /** Three items — the RYO runtime invariant — with per-item media. */
  const runtimeState = (media: unknown[]): GameplayModeState => ({
    teamActionJson,
    itemsJson: JSON.stringify(
      media.map((value, index) => ({
        id: `i${index}`,
        prompt: 'س',
        correctOptionId: 'x',
        media: value,
      })),
    ),
    teamIdsJson: JSON.stringify(['a', 'b']),
    startingTeamId: 'a',
    currentItemIndex: 0,
    phase: 'collecting',
    challengeId: 'c',
    worldId: 'w',
    slotKey: 's',
  });

  describe('ryoItemHasAudio', () => {
    it('is true only for the items that actually carry playable audio', () => {
      const state = runtimeState([AUDIO, null, IMAGE]);
      expect(ryoItemHasAudio(state, 0)).toBe(true);
      expect(ryoItemHasAudio(state, 1)).toBe(false);
      expect(ryoItemHasAudio(state, 2)).toBe(false);
    });

    it('is false for audio with no URL, so a barrier never waits on nothing', () => {
      expect(ryoItemHasAudio(runtimeState([{ type: 'audio' }]), 0)).toBe(false);
      expect(
        ryoItemHasAudio(runtimeState([{ type: 'audio', url: '' }]), 0),
      ).toBe(false);
    });

    it('is false past the end of the item list rather than throwing', () => {
      expect(ryoItemHasAudio(runtimeState([AUDIO]), 7)).toBe(false);
    });

    it('is false for an unreadable runtime instead of stalling the challenge', () => {
      expect(ryoItemHasAudio({ itemsJson: 'not json' }, 0)).toBe(false);
      expect(ryoItemHasAudio({}, 0)).toBe(false);
    });
  });

  describe('ryoItemAudioUrl', () => {
    it('returns the clip the shared screen must buffer', () => {
      expect(ryoItemAudioUrl(runtimeState([AUDIO]), 0)).toBe(AUDIO.url);
    });

    it('returns nothing for an image item, so no barrier preloads a picture', () => {
      expect(ryoItemAudioUrl(runtimeState([IMAGE]), 0)).toBeUndefined();
    });

    it('returns nothing for a text item or an unreadable runtime', () => {
      expect(ryoItemAudioUrl(runtimeState([null]), 0)).toBeUndefined();
      expect(ryoItemAudioUrl({ itemsJson: '{' }, 0)).toBeUndefined();
    });
  });

  describe('projectRuntimeState', () => {
    it('publishes the cooldown the server itself enforces', () => {
      const projected = RYO_GAMEPLAY_PLUGIN.projectRuntimeState(
        runtimeState([AUDIO, AUDIO, AUDIO]),
      );
      // The client must not hold a second copy of this rule. It renders what
      // the server enforces, and the server refuses it regardless.
      expect(projected.audioReplayCooldownSeconds).toBe(
        RYO_REPLAY_COOLDOWN_SECONDS,
      );
    });

    it('still publishes no answer anywhere in the runtime projection', () => {
      const projected = RYO_GAMEPLAY_PLUGIN.projectRuntimeState(
        runtimeState([AUDIO, AUDIO, AUDIO]),
      );
      expect(JSON.stringify(projected)).not.toContain('correctOptionId');
    });
  });

  describe('projectPrompt media redaction', () => {
    const interaction = RYO_GAMEPLAY_PLUGIN.interaction!;
    const prompt = (media: unknown) =>
      ({
        type: 'ryo.item',
        schemaVersion: 1,
        publicPayload: {
          itemJson: JSON.stringify({
            id: 'i0',
            prompt: 'س',
            media,
            answerMode: 'multiple_choice',
            options: [{ id: 'o1', label: 'أ' }],
          }),
          answeringTeamId: 'a',
          opposingTeamId: 'b',
          answererParticipantId: 'p',
          deciderParticipantId: 'q',
        },
        participantPayload: {},
        hostPayload: {},
        internalPayload: {
          answeringTeamId: 'a',
          opposingTeamId: 'b',
          answererParticipantId: 'p',
          deciderParticipantId: 'q',
        },
        visibility: 'public',
        metadata: {},
      }) as never;

    const projectedMedia = (
      media: unknown,
      actor: { controller: boolean; participantId?: string; teamId?: string },
    ) => {
      const result = interaction.projectPrompt!(
        prompt(media),
        actor as never,
        runtimeState([AUDIO, AUDIO, AUDIO]),
      ) as { itemJson: string } | undefined;
      return (
        JSON.parse(result!.itemJson) as {
          media?: { type?: string; url?: string };
        }
      ).media;
    };

    it('gives the shared screen the audio URL — it is the surface that plays it', () => {
      expect(projectedMedia(AUDIO, { controller: true })).toEqual(AUDIO);
    });

    it('withholds the audio URL from a player on the answering team', () => {
      const media = projectedMedia(AUDIO, {
        controller: false,
        participantId: 'p',
        teamId: 'a',
      });
      // A filename is an answer in a music round. The phone never rendered this
      // URL; it only ever sat in the devtools of the player being asked to name
      // the song.
      expect(media).toEqual({ type: 'audio' });
      expect(media).not.toHaveProperty('url');
    });

    it('withholds the audio URL from a player on the opposing team', () => {
      expect(
        projectedMedia(AUDIO, {
          controller: false,
          participantId: 'q',
          teamId: 'b',
        }),
      ).toEqual({ type: 'audio' });
    });

    it('still tells a phone that audio EXISTS, so it can offer «إعادة المقطع»', () => {
      const media = projectedMedia(AUDIO, { controller: false, teamId: 'a' });
      expect(media?.type).toBe('audio');
    });

    it('withholds the audio caption too — nothing renders it, and it names the song', () => {
      const media = projectedMedia(
        { ...AUDIO, altText: 'أم كلثوم — أنت عمري' },
        { controller: false, teamId: 'a' },
      );
      expect(media).toEqual({ type: 'audio' });
      expect(JSON.stringify(media)).not.toContain('كلثوم');
    });

    it('keeps the audio caption for the shared screen', () => {
      const withCaption = { ...AUDIO, altText: 'مقطع' };
      expect(projectedMedia(withCaption, { controller: true })).toEqual(
        withCaption,
      );
    });

    it('leaves image media untouched — only audio is withheld', () => {
      // A picture question is useless on a phone without its URL, and the phone
      // is not the surface the audio redaction protects.
      expect(projectedMedia(IMAGE, { controller: false, teamId: 'a' })).toEqual(
        IMAGE,
      );
    });

    it('leaves a text-only item alone', () => {
      expect(
        projectedMedia(null, { controller: false, teamId: 'a' }),
      ).toBeNull();
    });

    it('keeps the rest of the item intact when it redacts', () => {
      const result = interaction.projectPrompt!(
        prompt(AUDIO),
        { controller: false, teamId: 'a' } as never,
        runtimeState([AUDIO, AUDIO, AUDIO]),
      ) as { itemJson: string };
      const item = JSON.parse(result.itemJson) as Record<string, unknown>;
      expect(item.prompt).toBe('س');
      expect(item.options).toEqual([{ id: 'o1', label: 'أ' }]);
      expect(item.answerMode).toBe('multiple_choice');
    });

    it('still assigns an actor role and the live assignments', () => {
      // The redaction must not have replaced the projection it wraps.
      const result = interaction.projectPrompt!(
        prompt(AUDIO),
        { controller: false, teamId: 'a', participantId: 'p' } as never,
        runtimeState([AUDIO, AUDIO, AUDIO]),
      ) as Record<string, unknown>;
      expect(result.actorRole).toBe('answering');
      expect(result.isAssignedActor).toBe(true);
    });
  });
});
