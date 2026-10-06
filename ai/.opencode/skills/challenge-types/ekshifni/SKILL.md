---
name: challenge-type-ekshifni
description: Signature Celebrities World mechanic featuring progressive reveal of a real-person photograph under six numbered masks.
---

# ChallengeType: اكشفني (ekshifni)

## Identity & Player Experience
A progressive reveal game. Teams take turns buying information by lifting one of six numbered masks covering a celebrity photograph. The less information bought, the higher the points scored.

## Item Structure
`itemStructure: discrete_triple`
Three items per challenge. The core payload contains exactly ONE authentic real-person image asset and EXACTLY SIX author-defined masks.

## Payload Contract

An اكشفني item is an ordinary ContentItem. There is **no** `mode: ekshifni` and **no** `targetAnswer` field —
the answer lives where every other mechanic's answer lives.

**`answerPayload`** — `mode: match`, with the celebrity's names in `acceptedAnswers`. The ChallengeType
resolves MATCH items (`ANSWER_MODE_COMPATIBLE_ITEM_MODES[EKSHIFNI] === [MATCH]`, and the launcher's
`isPlayableItem` asserts the same), so answers go through the canonical answer architecture and the shared
Arabic normalizer rather than a payload field of their own.

**`media`** — `type: image` with **exactly one** asset carrying a non-empty `url`. Anything else is
`EKSHIFNI_IMAGE_INVALID`.

**`mechanicPayload.ekshifni`** — the reveal regions:
- `variant`: the literal string `'ekshifni'`. Absent or wrong ⇒ `EKSHIFNI_PAYLOAD_REQUIRED`.
- `regions`: **exactly 6** (`EKSHIFNI_REGION_COUNT`), or `EKSHIFNI_REGION_COUNT_INVALID`. Each region:
  - `localId` — unique and stable across edits, so a recorded reveal never drifts onto another mask
    (`EKSHIFNI_REGION_IDS_INVALID`).
  - `role` — exactly one of `eyes`, `hair-head`, `mouth-facial-hair`, `outfit`, `background`,
    `distinctive-detail`; each role appears **once** (`EKSHIFNI_REGION_ROLE_INVALID`,
    `EKSHIFNI_REGION_ROLES_DUPLICATED`). Roles are authoring vocabulary and are **never** player-facing: the
    runtime projects neutral numbers 1..6, because the role of a region is itself a clue.
  - `shape` — `{x, y, width, height}` as fractions of the natural image, each in `0..1`, width and height
    strictly positive, and `x + width` / `y + height` inside the image (a 1e-4 tolerance forgives an authoring
    UI dragging a box flush to the border). Otherwise `EKSHIFNI_REGION_GEOMETRY_INVALID`.

**Counts the runtime fixes:** `EKSHIFNI_ITEM_COUNT = 3` items per challenge launch (fixed, not a range) and
`EKSHIFNI_VALUES = [5, 4, 3, 2, 1]` — 5 before any reveal, one point per reveal, floor 1, which is the point of
the sixth region: it stays revealable after the value has bottomed out.

## Content Semantics & Mask Geometry
- **Authentic Real Person:** ONLY authentic real-person photography. No AI-generated, synthetic, lookalike, or generic models.
- **Subject Prominence:** The celebrity must dominate the frame, with a clear face/upper body.
- **Progressive Reveal:** Masks must be designed to create tension. Avoid one mask giving away the entire face, or masks covering purely irrelevant background.
- **Fractional Coordinates:** Mask shapes MUST strictly fall within `0.0` to `1.0`. `x + width <= 1.0` and `y + height <= 1.0`.

## Modality Constraints
- Allowed: `image`
- FORBIDDEN: `audio`, `video`, `none`

## Anti-Patterns
- Fixed-ratio cropping that breaks the fractional geometry.
- Text or logos leaking identity outside of masked regions.
- Background masks that provide zero value to the players.
- Masks that overlap accidentally leaving key identifying features visible.

## QA Gates

`AUTHENTIC_REAL_PERSON_ONLY` is a Product rule enforced by review, not by code.

The rest are the codes the runtime actually emits
(`backend/src/modules/world-content/domain/ekshifni-content.policy.ts`) — quote these, not paraphrases, so an
authoring failure and a runtime rejection name the same thing:

- `EKSHIFNI_PAYLOAD_REQUIRED`
- `EKSHIFNI_IMAGE_INVALID`
- `EKSHIFNI_REGION_COUNT_INVALID`
- `EKSHIFNI_REGION_IDS_INVALID`
- `EKSHIFNI_REGION_ROLE_INVALID`
- `EKSHIFNI_REGION_ROLES_DUPLICATED`
- `EKSHIFNI_REGION_GEOMETRY_INVALID`
