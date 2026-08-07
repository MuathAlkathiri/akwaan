# Active Learned Rules

Operational reminders seeded from explicit Akwaan rules. This file does not
replace the Design Bible or Subject knowledge.

## Active Rejection Rules — Global

- `DIRECT_RELATIONSHIP`: reject direct relationship questions unless the
  relationship is a meaningful reveal, mystery, or plot event.
- `ANSWER_LEAKAGE`: reject any question whose answer is exposed by its wording,
  setup, visible context, Media, filename, caption, or metadata.
- `ANSWER_LEAKAGE` semantic: reject semantic answer leakage. The answer must not
  be recoverable merely by combining or translating the descriptive words in the
  question. Technique, object, title, location, and ability questions should
  preferably be grounded in a remembered scene, use, consequence, or event rather
  than paraphrased from the question text.
- `MULTIPLE_RECOGNITION_CHANNELS`: use one primary recognition channel.
- `MAIN_CHARACTER_IDENTIFICATION`: do not directly identify protagonists, title
  characters, mascots, or obvious top-recognition characters.
- `QUESTION_TOO_OBVIOUS`: Direct Character Identification may not exceed 15% of
  a Generated Content Set.
- `PRODUCTION_TRIVIA`: reject production trivia in entertainment Catalogs unless
  explicitly requested.
- `DECORATIVE_MEDIA`: reject Media that is not essential to solving the
  question.
- `PROMOTIONAL_ASSET`: reject promotional artwork for Direct Character
  Identification when a real scene is available.
- `MULTIPLE_RECOGNITION_CHANNELS`: reject image identification combined with
  textual character clues that independently reveal the same character.
- `ANSWER_LEAKAGE`: reject questions asking for information already stated in
  the setup.
- `AUDIO_ANSWER_LEAKAGE` (media leakage): reject any Audio/Video segment in
  which the answer itself is spoken — announcer calls, dialogue, voice lines,
  lyrics, or narration. The Asset must never say the answer. A segment that
  leaks the answer is an `INVALID_MEDIA_SEGMENT` and must be re-clipped or
  replaced; the question is not complete until the repaired clip passes the
  leakage check.
- `INSUFFICIENT_ASSET_EVIDENCE` (Asset Evidence Sufficiency, Blind Asset Test):
  run the Blind Asset Test on every Media question before finalizing — cover
  the question text and inspect the Asset in isolation. The Asset alone must
  carry enough evidence for one fair, unambiguous answer. Reject the Asset when
  the asked-about target is absent (`TARGET_NOT_VISIBLE`), not visually
  dominant (`TARGET_NOT_VISUALLY_DOMINANT`), ambiguous, or otherwise
  insufficient, regardless of how the question is worded.
- `ACCESSIBILITY_MISMATCH`: when a reviewed ContentItem plays much more or less
  demanding than intended for its audience and fixed mechanic, repair the item
  or its placement. Never add or persist a difficulty label.

## Active Rejection Rules — Promoted Feedback

- `MAIN_CHARACTER_IDENTIFICATION` (Naruto-specific): Do not use Naruto Uzumaki
  as the answer to Direct Character Identification questions. Naruto may still
  appear in scene, event, action, ability, dialogue, sequence, or
  visual-observation questions. Source: 1 rejection record (2026-07-31).

## Active Rejection Rules — Call of Duty (Subject)

- `RECOGNITION_SATURATION` (call-of-duty): the CoD community has always-on
  memory for the most famous maps (`Rust`, `Nuketown`, `Shipment`, `Terminal`),
  weapons, streaks, perks, and sounds; nearly any casual CoD player identifies
  them instantly from a single distinctive frame or clip. Direct
  identification of a Recognition-Saturated item is trivially easy and unfair
  (`QUESTION_TOO_OBVIOUS`, `UNFAIR_DEMAND`). Do not use famous
  top-recognition direct IDs as low-demand items, and cap the number of famous
  direct-recognition items per batch regardless of the answer-class ceiling.
  When a famous item is needed, require a recalled observation (distinctive
  corner, behavior, specific use) rather than "what is this famous thing".
  Source: 3 rejection records (2026-08-01: Rust, Nuketown, Shipment).
- `AUDIO_ANSWER_LEAKAGE` (call-of-duty): never use a clip in which the announcer
  or a character voices the answer (e.g., a Hardpoint clip where the announcer
  says "Hardpoint"). Source: 2 rejection records (2026-08-01).
- Asset Evidence Sufficiency (call-of-duty): a perk icon or equipment device
  frame must clearly and dominantly show the asked-about target; generic
  selection screens where the target is not dominant, and frames where the
  target is absent, are rejected. Source: 4 rejection records (2026-08-01:
  Juggernaut icon, Claymore device, global principles).

## Active Positive Preferences

- `FAMILIAR_BUT_NOT_IMMEDIATE` (subject scope — Naruto): Prefer recognizable
  characters, events, objects, locations, and facts that most viewers have
  encountered but may need a short recall moment to retrieve. The answer should
  feel familiar and satisfying once revealed. For accessible ContentItems: avoid answers
  that are instantly obvious from the media; avoid obscure side facts; prefer
  important but less immediately recalled information. Aim for the reaction:
  "I knew that — I just needed a moment." This preference must not replace
  accessibility validation or cause repetition. Historical source records may
  contain legacy difficulty labels; these must not be copied into new output.
- `DISTINCTIVE_AUDIO_OBJECT` (subject scope — Call of Duty): audio-only
  identification of an iconic object or sound whose clip is unmistakable (e.g.,
  the Zombies Mystery Box mechanism) is a strong question type; prefer it when
  the sound alone cleanly identifies a fair, non-trivial answer. Source: 1
  approval record (2026-08-01: Q11 Mystery Box, corrected to Easy).
